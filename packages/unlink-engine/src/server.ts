/**
 * BankOS local Unlink engine emulator.
 *
 * Mirrors the role of the hosted Unlink engine: it holds the shielded ledger, verifies EdDSA-signed
 * spends, and acts as the on-chain **relayer** that settles withdrawals from `PrivacyPool`. Deposits
 * are confirmed against the on-chain `Deposited` event before crediting the shielded balance.
 *
 * Switch to the real hosted engine by using `LiveUnlinkClient` (no server needed) with
 * UNLINK_ENGINE_URL + UNLINK_API_KEY.
 */
import express from "express";
import cors from "cors";
import {z, ZodError} from "zod";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {randomBytes} from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  hexToString,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {abis} from "@bankos/shared/abis";
import {chainById, ARC_EURC, type Deployment} from "@bankos/shared";
import {ShieldedLedger} from "./ledger.js";
import {deserializeSig} from "./account.js";
import {
  bandFor,
  canonical,
  encodeStatement,
  verifyStatementToken,
  type ComplianceClaim,
  type Statement,
  type StatementClaims,
} from "./statements.js";
import {SettlementBook, type Settlement, type NetPosition} from "./settlements.js";
import {fxOut, fxRateLabel, type Currency} from "./fx.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const chainId = Number(process.env.CHAIN_ID ?? 31337);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const chain = chainById(chainId);

const dep = JSON.parse(
  readFileSync(
    process.env.DEPLOYMENT_PATH ?? join(__dir, "..", "..", "contracts", "deployments", `${chainId}.json`),
    "utf8",
  ),
) as Deployment;

// anvil account #5 is the engine relayer wired into PrivacyPool at deploy.
const relayerPk = (process.env.ENGINE_PRIVATE_KEY ??
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba") as Hex;
const relayer = privateKeyToAccount(relayerPk);

const publicClient = createPublicClient({chain, transport: http(rpcUrl)});
const walletClient = createWalletClient({account: relayer, chain, transport: http(rpcUrl)});
const ledger = new ShieldedLedger();
const book = new SettlementBook();

// ---- request validation (zod) ----
const unlinkAddr = z.string().startsWith("unlink1").max(256);
const evmAddr = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid EVM address");
const decStr = z.string().regex(/^\d+$/, "expected a decimal string");
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected bytes32 hex");
const sigSchema = z.object({R8: z.tuple([decStr, decStr]), S: decStr});

const registerSchema = z.object({unlinkAddress: unlinkAddr, spendingPublicKey: z.tuple([decStr, decStr])});
const depositSchema = z.object({unlinkAddress: unlinkAddr, token: evmAddr, amount: decStr, commitment: hex32, txHash: hex32});
const transferSchema = z.object({from: unlinkAddr, to: unlinkAddr, token: evmAddr, amount: decStr, nonce: decStr, sig: sigSchema});
const withdrawSchema = z.object({from: unlinkAddr, recipientEvm: evmAddr, token: evmAddr, amount: decStr, nonce: decStr, sig: sigSchema});

function badRequest(res: express.Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({error: "invalid request", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`)});
    return true;
  }
  return false;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ok: true, service: "charter-unlink-engine", relayer: relayer.address, ...ledger.stats()}),
);

app.get("/info/environment", (_req, res) =>
  res.json({chainId, privacyPool: dep.privacyPool, usdc: dep.usdc, relayer: relayer.address}),
);

app.post("/register", (req, res) => {
  try {
    const {unlinkAddress, spendingPublicKey} = registerSchema.parse(req.body);
    ledger.register(unlinkAddress, [BigInt(spendingPublicKey[0]), BigInt(spendingPublicKey[1])]);
    res.json({ok: true, unlinkAddress, nonce: ledger.nonceOf(unlinkAddress).toString()});
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "register failed"});
  }
});

app.get("/nonce/:unlinkAddress", (req, res) => {
  try {
    res.json({nonce: ledger.nonceOf(req.params.unlinkAddress).toString()});
  } catch (e: any) {
    res.status(404).json({error: e?.message});
  }
});

app.get("/balance/:unlinkAddress/:token", (req, res) => {
  res.json({balance: ledger.balanceOf(req.params.unlinkAddress, req.params.token).toString()});
});

// Confirm an on-chain deposit, then credit the shielded balance.
app.post("/deposit", async (req, res) => {
  try {
    const {unlinkAddress, token, amount, commitment, txHash} = depositSchema.parse(req.body) as {
      unlinkAddress: string;
      token: Address;
      amount: string;
      commitment: Hex;
      txHash: Hex;
    };
    const receipt = await publicClient.waitForTransactionReceipt({hash: txHash});
    const events = parseEventLogs({abi: abis.PrivacyPool, logs: receipt.logs, eventName: "Deposited"});
    const match = events.find(
      (e: any) => (e.args.commitment as string).toLowerCase() === commitment.toLowerCase(),
    );
    if (!match) return res.status(400).json({error: "deposit commitment not found on-chain"});
    if ((match as any).args.amount.toString() !== amount) {
      return res.status(400).json({error: "deposit amount mismatch"});
    }
    ledger.applyDeposit({unlinkAddress, token, amount: BigInt(amount), commitment, txHash});
    res.json({ok: true, balance: ledger.balanceOf(unlinkAddress, token).toString()});
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "deposit failed"});
  }
});

// Private transfer — never touches the chain.
app.post("/transfer", async (req, res) => {
  try {
    const {from, to, token, amount, nonce, sig} = transferSchema.parse(req.body);
    await ledger.transfer({
      from,
      to,
      token,
      amount: BigInt(amount),
      nonce: BigInt(nonce),
      sig: deserializeSig(sig),
    });
    res.json({ok: true, fromBalance: ledger.balanceOf(from, token).toString()});
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "transfer failed"});
  }
});

// Withdrawal — engine verifies, debits shielded balance, settles on-chain via PrivacyPool.
app.post("/withdraw", async (req, res) => {
  try {
    const {from, recipientEvm, token, amount, nonce, sig} = withdrawSchema.parse(req.body);
    const {nullifier} = await ledger.prepareWithdraw({
      from,
      recipientEvm,
      token,
      amount: BigInt(amount),
      nonce: BigInt(nonce),
      sig: deserializeSig(sig),
    });
    const txHash = await walletClient.writeContract({
      address: dep.privacyPool,
      abi: abis.PrivacyPool,
      functionName: "withdraw",
      args: [recipientEvm as Address, BigInt(amount), nullifier],
    });
    await publicClient.waitForTransactionReceipt({hash: txHash});
    res.json({ok: true, txHash, nullifier, balance: ledger.balanceOf(from, token).toString()});
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "withdraw failed"});
  }
});

// ---- currency recognition (USDC = the deployed token; EURC = canonical Arc EURC) ----
function symbolOf(token: Address): Currency | null {
  const t = token.toLowerCase();
  if (t === dep.usdc.toLowerCase()) return "USDC";
  if (t === ARC_EURC.toLowerCase() || (dep.eurc && t === dep.eurc.toLowerCase())) return "EURC";
  return null;
}
function currencyOf(token: Address): string {
  return symbolOf(token) ?? "TOKEN";
}

/** Read a member's on-chain compliance policy (attested via Chainlink CRE) from PolicyRegistry. */
async function readPolicy(bank: Address, member: Address): Promise<ComplianceClaim | null> {
  try {
    const p: any = await publicClient.readContract({
      address: dep.policyRegistry,
      abi: abis.PolicyRegistry,
      functionName: "getPolicy",
      args: [bank, member],
    });
    const jurisdiction = hexToString(p.jurisdiction as Hex, {size: 32}).replace(/ +$/, "");
    return {
      tier: Number(p.tier),
      jurisdiction,
      canDeposit: Boolean(p.canDeposit),
      canBorrow: Boolean(p.canBorrow),
      expiry: Number(p.expiry),
    };
  } catch {
    return null;
  }
}

const statementSchema = z.object({
  subject: unlinkAddr,
  token: evmAddr.optional(),
  bank: evmAddr.optional(),
  member: evmAddr.optional(),
  bandSize: decStr.optional(),
  disclose: z.object({
    balanceBand: z.boolean().optional(),
    compliance: z.boolean().optional(),
    activity: z.boolean().optional(),
  }),
});
const verifySchema = z.object({token: z.string().min(1).max(8192)});

// Issue a member-selected, bank-signed statement (balance band / compliance / activity).
app.post("/statement", async (req, res) => {
  try {
    const {subject, token, bank, member, bandSize, disclose} = statementSchema.parse(req.body);
    const tok = (token ?? dep.usdc) as Address;
    const claims: StatementClaims = {};

    if (disclose.balanceBand) {
      const bal = ledger.balanceOf(subject, tok);
      const size = BigInt(bandSize ?? "10000000000"); // default band width: 10,000 USDC (6dp)
      const {lower, upper} = bandFor(bal, size);
      claims.balanceBand = {
        token: tok,
        currency: currencyOf(tok),
        decimals: 6,
        lower: lower.toString(),
        upper: upper.toString(),
      };
    }
    if (disclose.compliance && bank && member) {
      const c = await readPolicy(bank as Address, member as Address);
      if (c) claims.compliance = c;
    }
    if (disclose.activity) {
      const registered = ledger.isRegistered(subject);
      claims.activity = {registered, privateTransfers: registered ? Number(ledger.nonceOf(subject)) : 0};
    }

    const now = Math.floor(Date.now() / 1000);
    const statement: Statement = {
      issuer: "BankOS",
      subject,
      bank,
      claims,
      issuedAt: now,
      expiresAt: now + 600, // statements are short-lived (10 min)
      nonce: `0x${randomBytes(8).toString("hex")}`,
    };
    const signature = await relayer.signMessage({message: canonical(statement)});
    res.json({
      token: encodeStatement({statement, signature, signer: relayer.address}),
      statement,
      signer: relayer.address,
    });
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "statement failed"});
  }
});

// Convenience server-side verify (the web verifies client-side too, fully trustless).
app.post("/statement/verify", async (req, res) => {
  try {
    const {token} = verifySchema.parse(req.body);
    res.json(await verifyStatementToken(token, relayer.address));
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "verify failed"});
  }
});

// ---- inter-bank settlement (feature #9) ----
const serializeSettlement = (s: Settlement) => ({...s, amount: s.amount.toString()});
const serializeNet = (n: NetPosition) => ({
  ...n,
  grossAToB: n.grossAToB.toString(),
  grossBToA: n.grossBToA.toString(),
  net: n.net.toString(),
});

const treasurySchema = z.object({bank: evmAddr, unlinkAddress: unlinkAddr});
const settlementSchema = z.object({
  from: unlinkAddr,
  to: unlinkAddr,
  token: evmAddr,
  amount: decStr,
  nonce: decStr,
  sig: sigSchema,
  fromBank: evmAddr,
  toBank: evmAddr,
  memo: z.string().max(140).optional(),
});

// A bank publishes its treasury settlement account so counterparties can discover it.
app.post("/settlement/treasury", (req, res) => {
  try {
    const {bank, unlinkAddress} = treasurySchema.parse(req.body);
    book.registerTreasury(bank, unlinkAddress);
    res.json({ok: true, bank, unlinkAddress});
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "register treasury failed"});
  }
});

app.get("/settlement/treasury/:bank", (req, res) => {
  const unlinkAddress = book.treasuryOf(req.params.bank);
  if (!unlinkAddress) return res.status(404).json({error: "no treasury registered for this bank"});
  res.json({bank: req.params.bank, unlinkAddress});
});

// Settle privately between two banks' treasuries — a real private transfer, recorded and nettable.
app.post("/settlement", async (req, res) => {
  try {
    const {from, to, token, amount, nonce, sig, fromBank, toBank, memo} = settlementSchema.parse(req.body);
    await ledger.transfer({
      from,
      to,
      token,
      amount: BigInt(amount),
      nonce: BigInt(nonce),
      sig: deserializeSig(sig),
    });
    const settlement: Settlement = {
      id: `0x${randomBytes(8).toString("hex")}`,
      fromBank,
      toBank,
      token,
      amount: BigInt(amount),
      memo: memo ?? "",
      at: Math.floor(Date.now() / 1000),
    };
    book.record(settlement);
    res.json({
      ok: true,
      settlement: serializeSettlement(settlement),
      net: serializeNet(book.net(fromBank, toBank)),
    });
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "settlement failed"});
  }
});

app.get("/settlements/:bank", (req, res) => {
  res.json({settlements: book.forBank(req.params.bank).map(serializeSettlement)});
});

app.get("/settlement/net/:bankA/:bankB", (req, res) => {
  res.json(serializeNet(book.net(req.params.bankA, req.params.bankB)));
});

// ---- multi-currency FX (feature #10): private USDC <-> EURC swap in the shielded ledger ----
const fxSchema = z.object({
  unlinkAddress: unlinkAddr,
  fromToken: evmAddr,
  toToken: evmAddr,
  amountIn: decStr,
  nonce: decStr,
  sig: sigSchema,
});

app.get("/fx/rate", (_req, res) =>
  res.json({usdc: dep.usdc, eurc: ARC_EURC, eurcPerUsdc: fxRateLabel("USDC", "EURC"), usdcPerEurc: fxRateLabel("EURC", "USDC")}),
);

app.post("/fx", async (req, res) => {
  try {
    const {unlinkAddress, fromToken, toToken, amountIn, nonce, sig} = fxSchema.parse(req.body);
    const from = symbolOf(fromToken as Address);
    const to = symbolOf(toToken as Address);
    if (!from || !to) return res.status(400).json({error: "unsupported currency"});
    if (from === to) return res.status(400).json({error: "from and to currency are the same"});
    const amountOut = fxOut(BigInt(amountIn), from as Currency, to as Currency);
    await ledger.fxSwap({
      unlinkAddress,
      fromToken,
      toToken,
      amountIn: BigInt(amountIn),
      amountOut,
      nonce: BigInt(nonce),
      sig: deserializeSig(sig),
    });
    res.json({
      ok: true,
      amountOut: amountOut.toString(),
      fromBalance: ledger.balanceOf(unlinkAddress, fromToken).toString(),
      toBalance: ledger.balanceOf(unlinkAddress, toToken).toString(),
    });
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(400).json({error: e?.message ?? "fx failed"});
  }
});

// Railway/Render/Fly inject PORT; honor it first, then the app-specific override, then the local default.
const PORT = Number(process.env.PORT ?? process.env.ENGINE_PORT ?? 4002);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`BankOS Unlink engine (emulator) on :${PORT}`);
  console.log(`  relayer:     ${relayer.address}`);
  console.log(`  privacyPool: ${dep.privacyPool}`);
});
