/**
 * Selective-disclosure statements (feature #7).
 *
 * A member proves *selected* facts about their bank standing to an outside party (an auditor or a
 * lender) without revealing everything:
 *   - their **balance as a band** (e.g. "between 20,000 and 30,000 USDC") rather than the exact figure,
 *   - their **on-chain compliance** (KYC tier / jurisdiction / eligibility) as attested via Chainlink CRE,
 *   - their **account activity** (registered, # of private transfers) — never the counterparties.
 *
 * The bank (the engine relayer key) signs the chosen claims; **verification is trustless** — anyone can
 * check the signature client-side with viem `verifyMessage`, no call back to the bank required. The
 * member chooses which claims to include, so disclosure is minimal by construction.
 */
import {verifyMessage, type Address, type Hex} from "viem";

export interface BalanceBandClaim {
  token: string;
  currency: string; // e.g. "USDC"
  decimals: number; // base-unit decimals (6 for USDC)
  lower: string; // inclusive lower bound, base units (decimal string)
  upper: string; // exclusive upper bound, base units (decimal string)
}

export interface ComplianceClaim {
  tier: number;
  jurisdiction: string;
  canDeposit: boolean;
  canBorrow: boolean;
  expiry: number; // unix seconds, 0 = none
}

export interface ActivityClaim {
  registered: boolean;
  privateTransfers: number; // = account nonce: spends authorized so far
}

export interface StatementClaims {
  balanceBand?: BalanceBandClaim;
  compliance?: ComplianceClaim;
  activity?: ActivityClaim;
}

export interface Statement {
  issuer: string; // "BankOS"
  subject: string; // the member's unlink1… address (a privacy-preserving identifier)
  bank?: string; // bank EVM address the claims pertain to, when relevant
  claims: StatementClaims;
  issuedAt: number; // unix seconds
  expiresAt: number; // unix seconds — statements are short-lived
  nonce: string; // random hex; makes each statement unique (anti-replay)
}

export interface SignedStatement {
  statement: Statement;
  signature: Hex;
  signer: Address; // the bank authority that signed (the engine relayer)
}

/** Floor `amount` to a multiple of `bandSize` and return the [lower, upper) band it falls in. */
export function bandFor(amount: bigint, bandSize: bigint): {lower: bigint; upper: bigint} {
  if (bandSize <= 0n) return {lower: amount, upper: amount}; // exact (no banding requested)
  const lower = (amount / bandSize) * bandSize;
  return {lower, upper: lower + bandSize};
}

/**
 * Deterministic, stable JSON serialization (recursively sorted keys) — both signer and verifier must
 * hash the exact same bytes, so key order cannot be left to chance.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

// ---- portable base64url (works in Node and the browser, UTF-8 safe) ----
function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(t: string): string {
  const b64 = t.replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a signed statement into a compact, shareable token. */
export function encodeStatement(signed: SignedStatement): string {
  return toB64Url(JSON.stringify(signed));
}

export function decodeStatement(token: string): SignedStatement {
  return JSON.parse(fromB64Url(token)) as SignedStatement;
}

export interface VerifyResult {
  valid: boolean;
  statement?: Statement;
  signer?: Address;
  reason?: string;
}

/**
 * Trustlessly verify a statement token: the signer recovered from the signature must match the embedded
 * signer, and (when provided) the `expectedSigner` the verifier trusts. Also enforces expiry.
 */
export async function verifyStatementToken(token: string, expectedSigner?: Address): Promise<VerifyResult> {
  let decoded: SignedStatement;
  try {
    decoded = decodeStatement(token);
  } catch {
    return {valid: false, reason: "malformed token"};
  }
  const {statement, signature, signer} = decoded ?? ({} as SignedStatement);
  if (!statement || !signature || !signer) return {valid: false, reason: "missing fields"};
  if (expectedSigner && signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    return {valid: false, statement, signer, reason: "signed by an untrusted key"};
  }
  let ok = false;
  try {
    ok = await verifyMessage({address: signer, message: canonical(statement), signature});
  } catch (e: any) {
    return {valid: false, statement, signer, reason: e?.message ?? "verification error"};
  }
  if (!ok) return {valid: false, statement, signer, reason: "signature does not match signer"};
  if (statement.expiresAt && statement.expiresAt * 1000 < Date.now()) {
    return {valid: false, statement, signer, reason: "statement expired"};
  }
  return {valid: true, statement, signer};
}
