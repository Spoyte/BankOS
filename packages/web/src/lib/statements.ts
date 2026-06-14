import {ENGINE_URL} from "../config";
import {verifyStatementToken, type Statement, type VerifyResult, type StatementClaims} from "@bankos/unlink-engine/statements";

// Re-export the trustless, client-side verifier + types so the verifier UI needs no server round-trip.
export {verifyStatementToken};
export type {Statement, VerifyResult, StatementClaims};

export interface IssueParams {
  subject: string; // the member's unlink1… address
  bank?: string;
  member?: string; // member EVM address (for the on-chain compliance claim)
  token?: string;
  bandSize?: string; // band width in base units; "0" = exact balance
  disclose: {balanceBand?: boolean; compliance?: boolean; activity?: boolean};
}

/** Ask the bank's engine to issue a member-selected, bank-signed disclosure statement. */
export async function issueStatement(p: IssueParams): Promise<{token: string; statement: Statement; signer: string}> {
  const res = await fetch(`${ENGINE_URL}/statement`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(p),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "statement failed");
  return json;
}

/** Human-readable band, e.g. "20,000 – 30,000 USDC". */
export function formatBand(b: {lower: string; upper: string; decimals: number; currency: string}): string {
  const unit = 10n ** BigInt(b.decimals);
  const fmt = (v: string) => (BigInt(v) / unit).toLocaleString("en-US");
  return `${fmt(b.lower)} – ${fmt(b.upper)} ${b.currency}`;
}
