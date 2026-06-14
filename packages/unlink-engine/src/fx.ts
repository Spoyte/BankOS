/**
 * Multi-currency FX (feature #10).
 *
 * BankOS holds two Arc-native stablecoins privately — USDC and EURC — in the shielded ledger, and lets
 * members swap between them. Rates are indicative and aligned with the LI.FI same-chain Arc USDC↔EURC
 * quote (~0.986 EURC per USDC; see ADR-001). The swap happens inside the shielded ledger, so a member's
 * currency mix — and the swap itself — stays private.
 */
export type Currency = "USDC" | "EURC";

/** FX rates in basis points (10000 = 1.0). */
export const FX_BPS: Record<Currency, Record<Currency, bigint>> = {
  USDC: {USDC: 10000n, EURC: 9860n}, // 1 USDC -> 0.9860 EURC
  EURC: {USDC: 10130n, EURC: 10000n}, // 1 EURC -> 1.0130 USDC (a small spread the bank keeps)
};

/** Output amount (same base-unit decimals) for swapping `amountIn` of `from` into `to`. */
export function fxOut(amountIn: bigint, from: Currency, to: Currency): bigint {
  return (amountIn * FX_BPS[from][to]) / 10000n;
}

/** Human-readable rate string, e.g. fxRateLabel("USDC","EURC") => "0.9860". */
export function fxRateLabel(from: Currency, to: Currency): string {
  return (Number(FX_BPS[from][to]) / 10000).toFixed(4);
}
