import {describe, it, expect} from "vitest";
import {fxOut, fxRateLabel} from "./fx.js";

describe("fxOut", () => {
  it("converts 1 USDC (6dp) to ~0.986 EURC", () => {
    expect(fxOut(1_000_000n, "USDC", "EURC")).toBe(986_000n);
  });
  it("converts 1 EURC to ~1.0130 USDC", () => {
    expect(fxOut(1_000_000n, "EURC", "USDC")).toBe(1_013_000n);
  });
  it("is identity for same currency", () => {
    expect(fxOut(1_234_567n, "USDC", "USDC")).toBe(1_234_567n);
  });
  it("round-trips back to approximately the original (within FX spread)", () => {
    const there = fxOut(1_000_000n, "USDC", "EURC");
    const back = fxOut(there, "EURC", "USDC");
    expect(Number(back)).toBeGreaterThan(995_000); // small spread loss only
    expect(Number(back)).toBeLessThanOrEqual(1_000_000);
  });
});

describe("fxRateLabel", () => {
  it("formats the rate", () => {
    expect(fxRateLabel("USDC", "EURC")).toBe("0.9860");
    expect(fxRateLabel("EURC", "USDC")).toBe("1.0130");
  });
});
