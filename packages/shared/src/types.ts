/// Mirror of contracts/src/libraries/CharterTypes.sol — shared by frontend + backend.

export interface Products {
  checking: boolean;
  yield: boolean;
  credit: boolean;
}

export interface RiskConfig {
  globalDepositCap: bigint;
  maxDepositPerMember: bigint;
  maxCreditPerBorrower: bigint;
  maxUtilizationBps: number;
  withdrawalDelay: number; // seconds
}

export interface Policy {
  tier: number;
  canDeposit: boolean;
  canBorrow: boolean;
  jurisdiction: `0x${string}`; // bytes32
  expiry: number; // unix seconds (0 = never)
}

/// The compliance decision the CRE workflow returns (off-chain shape before it is attested).
export interface ComplianceDecision {
  member: `0x${string}`;
  bank: `0x${string}`;
  approved: boolean;
  policy: Policy;
  reasons: string[];
  // opaque proof/attestation reference (in real CRE this is the DON report id)
  attestationRef: string;
}

export const USDC_DECIMALS = 6;

export function toUsdc(human: number | string): bigint {
  const [whole, frac = ""] = String(human).split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole || "0") * 1_000_000n + BigInt(fracPadded || "0");
}

export function fromUsdc(base: bigint): string {
  const whole = base / 1_000_000n;
  const frac = (base % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
