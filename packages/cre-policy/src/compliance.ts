import {keccak256, toHex} from "viem";

/**
 * The compliance "brain" shared by the real Chainlink CRE workflow and the local DON simulator.
 *
 * In production this runs INSIDE the CRE secure enclave: the raw KYC payload is sent to a
 * compliance provider via **Confidential HTTP** (sanctions / PEP / KYC), and only the *decision*
 * leaves the enclave. Raw PII never touches the chain — the on-chain `Policy` carries only a tier,
 * eligibility booleans, a coarse jurisdiction tag, and an expiry.
 *
 * This module is intentionally free of any CRE / Express dependency so both runtimes import it
 * verbatim, guaranteeing the local demo path and the DON path make identical decisions.
 */

export interface KycPayload {
  fullName: string;
  country: string; // ISO-3166 alpha-2, e.g. "US"
  region?: string; // e.g. "NY"
  dateOfBirth: string; // YYYY-MM-DD
  governmentIdHash?: string; // client-side hash of an ID doc; never the doc itself
  sanctionsConsent: boolean;
  requestsCredit?: boolean;
}

export interface Policy {
  tier: number;
  canDeposit: boolean;
  canBorrow: boolean;
  jurisdiction: `0x${string}`;
  expiry: number; // unix seconds
}

export interface ComplianceDecision {
  approved: boolean;
  policy: Policy;
  reasons: string[];
}

// Mock confidential data sources (stand in for the provider reached via Confidential HTTP).
const SANCTIONED_COUNTRIES = new Set(["KP", "IR", "SY", "CU", "RU-DNR", "RU-LNR"]);
const SDN_NAMES = new Set([
  "ivan sanction",
  "blocked person",
  "john doe sanctioned",
]);
const HIGH_RISK_NO_CREDIT = new Set(["VE", "MM"]); // can deposit, not borrow

const ONE_YEAR = 365 * 24 * 60 * 60;

function ageFrom(dob: string, now: number): number {
  const born = Date.parse(dob);
  if (Number.isNaN(born)) return -1;
  return Math.floor((now * 1000 - born) / (365.25 * 24 * 3600 * 1000));
}

export function jurisdictionTag(country: string, region?: string): `0x${string}` {
  const label = region ? `${country.toUpperCase()}-${region.toUpperCase()}` : country.toUpperCase();
  return keccak256(toHex(label));
}

/**
 * Evaluate a KYC payload into a compliance decision. `nowSeconds` is injectable for determinism.
 */
export function evaluateCompliance(kyc: KycPayload, nowSeconds = Math.floor(Date.now() / 1000)): ComplianceDecision {
  const reasons: string[] = [];
  const country = (kyc.country || "").toUpperCase();
  const name = (kyc.fullName || "").trim().toLowerCase();

  const reject = (reason: string): ComplianceDecision => {
    reasons.push(reason);
    return {
      approved: false,
      reasons,
      policy: {
        tier: 0,
        canDeposit: false,
        canBorrow: false,
        jurisdiction: jurisdictionTag(country, kyc.region),
        expiry: 0,
      },
    };
  };

  if (!kyc.sanctionsConsent) return reject("sanctions screening consent not given");
  if (SANCTIONED_COUNTRIES.has(country)) return reject(`jurisdiction ${country} is sanctioned`);
  if (SDN_NAMES.has(name)) return reject("name matched the SDN / sanctions list");

  const age = ageFrom(kyc.dateOfBirth, nowSeconds);
  if (age < 0) return reject("invalid date of birth");
  if (age < 18) return reject("applicant is under 18");

  // Approved. Determine product band.
  const hasFullId = Boolean(kyc.governmentIdHash && kyc.governmentIdHash.length >= 10);
  const canBorrow = Boolean(kyc.requestsCredit) && hasFullId && !HIGH_RISK_NO_CREDIT.has(country);

  let tier = 1; // basic checking
  if (hasFullId) tier = 2; // verified checking
  if (canBorrow) tier = 3; // credit-eligible

  reasons.push("passed sanctions + jurisdiction + age screening");
  if (hasFullId) reasons.push("government ID verified (hash only)");
  else reasons.push("no verified ID — deposit-only band");
  if (canBorrow) reasons.push("eligible for credit products");
  else if (kyc.requestsCredit) reasons.push("credit requested but not granted (needs verified ID / lower-risk jurisdiction)");

  return {
    approved: true,
    reasons,
    policy: {
      tier,
      canDeposit: true,
      canBorrow,
      jurisdiction: jurisdictionTag(country, kyc.region),
      expiry: nowSeconds + ONE_YEAR,
    },
  };
}
