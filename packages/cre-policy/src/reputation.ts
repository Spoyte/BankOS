/**
 * Reputation-based credit (feature #8).
 *
 * A member's **repayment history** (read from on-chain Borrowed/Repaid events) and their private
 * banking relationship drive a reputation score. The score unlocks a larger share of the bank's
 * per-borrower credit cap: a brand-new member starts at a fraction of the cap, and a track record of
 * on-time repayment unlocks up to the full cap. The raw history stays private — only the *decision*
 * (score → limit) is surfaced, mirroring the Chainlink-CRE "confidential inputs, attested decision" model.
 */
export interface ReputationInputs {
  repayments: number; // # of Repaid events by this member
  borrows: number; // # of Borrowed events (relationship tenure proxy)
  totalRepaidUsdc: number; // cumulative repaid, human units
  currentDebtUsdc: number; // current outstanding, human units
  creditCapUsdc: number; // the bank's max credit per borrower, human units
}

export interface ReputationResult {
  score: number; // 0..100
  tier: number; // 0..4
  multiplier: number; // share of the bank cap this member may access (0.2..1.0)
  factors: string[]; // human-readable reasons (for the UI)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Pure reputation scoring — deterministic, unit-testable, no I/O. */
export function scoreReputation(i: ReputationInputs): ReputationResult {
  const factors: string[] = [];
  let score = 40; // every compliant member starts mid-pack

  const repayBonus = Math.min(i.repayments * 10, 40);
  if (repayBonus > 0) factors.push(`+${repayBonus} for ${i.repayments} on-time repayment(s)`);
  score += repayBonus;

  const volumeBonus = Math.min(Math.floor(i.totalRepaidUsdc / 1000), 10);
  if (volumeBonus > 0) factors.push(`+${volumeBonus} for repayment volume`);
  score += volumeBonus;

  const tenureBonus = Math.min(i.borrows * 2, 10);
  if (tenureBonus > 0) factors.push(`+${tenureBonus} for an established borrowing relationship`);
  score += tenureBonus;

  if (i.creditCapUsdc > 0 && i.currentDebtUsdc > 0) {
    const util = clamp(i.currentDebtUsdc / i.creditCapUsdc, 0, 1);
    const penalty = Math.round(util * 15);
    if (penalty > 0) {
      factors.push(`-${penalty} for ${Math.round(util * 100)}% current utilization`);
      score -= penalty;
    }
  }

  score = clamp(Math.round(score), 0, 100);

  const tier = score >= 85 ? 4 : score >= 70 ? 3 : score >= 50 ? 2 : score >= 30 ? 1 : 0;
  const multiplier = [0.2, 0.4, 0.6, 0.8, 1.0][tier];
  return {score, tier, multiplier, factors};
}

/** The credit limit (human units) this reputation unlocks, capped by the bank's per-borrower cap. */
export function recommendedLimitUsdc(result: ReputationResult, creditCapUsdc: number): number {
  return Math.floor(creditCapUsdc * result.multiplier);
}
