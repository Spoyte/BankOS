import type {Address} from "viem";
import {POLICY_URL} from "../config";
import {getCreditHistory} from "./events";

export interface Reputation {
  score: number;
  tier: number;
  multiplier: number;
  factors: string[];
  recommendedLimitUsdc: number;
}

/**
 * Reputation-based credit (feature #8): read the member's on-chain repayment history and ask the CRE
 * policy service to score it into an unlocked credit limit (capped by the bank's per-borrower cap).
 */
export async function getReputation(
  bank: Address,
  member: Address,
  currentDebtUsdc: number,
  creditCapUsdc: number,
): Promise<Reputation> {
  const h = await getCreditHistory(bank, member);
  const res = await fetch(`${POLICY_URL}/reputation`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      repayments: h.repayments,
      borrows: h.borrows,
      totalRepaidUsdc: h.totalRepaidUsdc,
      currentDebtUsdc,
      creditCapUsdc,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "reputation failed");
  return json as Reputation;
}
