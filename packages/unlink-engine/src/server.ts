/**
 * Charter local Unlink engine emulator.
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
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {abis} from "@charter/shared/abis";
import {chainById, type Deployment} from "@charter/shared";
import {ShieldedLedger} from "./ledger.js";
import {deserializeSig} from "./account.js";

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

const PORT = Number(process.env.ENGINE_PORT ?? 4002);
app.listen(PORT, () => {
  console.log(`Charter Unlink engine (emulator) on http://127.0.0.1:${PORT}`);
  console.log(`  relayer:     ${relayer.address}`);
  console.log(`  privacyPool: ${dep.privacyPool}`);
});
