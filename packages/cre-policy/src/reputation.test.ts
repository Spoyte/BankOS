import {describe, it, expect} from "vitest";
import {scoreReputation, recommendedLimitUsdc, type ReputationInputs} from "./reputation.js";

const base: ReputationInputs = {repayments: 0, borrows: 0, totalRepaidUsdc: 0, currentDebtUsdc: 0, creditCapUsdc: 50000};

describe("scoreReputation", () => {
  it("a brand-new member starts at the lowest tier (fraction of the cap)", () => {
    const r = scoreReputation(base);
    expect(r.score).toBe(40);
    expect(r.tier).toBe(1);
    expect(r.multiplier).toBe(0.4);
    expect(recommendedLimitUsdc(r, 50000)).toBe(20000);
  });

  it("on-time repayments raise the score, tier, and unlocked limit", () => {
    const r = scoreReputation({...base, repayments: 4, borrows: 4, totalRepaidUsdc: 8000});
    // 40 + min(40,40) + min(8,10) + min(8,10) = 40+40+8+8 = 96
    expect(r.score).toBe(96);
    expect(r.tier).toBe(4);
    expect(r.multiplier).toBe(1.0);
    expect(recommendedLimitUsdc(r, 50000)).toBe(50000); // full cap unlocked
    expect(r.factors.some((f) => /repayment/.test(f))).toBe(true);
  });

  it("high utilization penalizes the score", () => {
    const low = scoreReputation({...base, repayments: 2, currentDebtUsdc: 0});
    const high = scoreReputation({...base, repayments: 2, currentDebtUsdc: 50000}); // 100% utilized
    expect(high.score).toBeLessThan(low.score);
  });

  it("clamps to 0..100 and produces a valid tier/multiplier", () => {
    const r = scoreReputation({repayments: 100, borrows: 100, totalRepaidUsdc: 1_000_000, currentDebtUsdc: 0, creditCapUsdc: 50000});
    expect(r.score).toBeLessThanOrEqual(100);
    expect([0, 1, 2, 3, 4]).toContain(r.tier);
    expect(r.multiplier).toBeGreaterThan(0);
  });
});
