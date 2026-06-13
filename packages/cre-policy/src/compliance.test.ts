import {describe, it, expect} from "vitest";
import {evaluateCompliance, jurisdictionTag, type KycPayload} from "./compliance.js";

const base: KycPayload = {
  fullName: "Alice Avery",
  country: "US",
  region: "NY",
  dateOfBirth: "1990-04-01",
  governmentIdHash: "id-hash-0xabc123",
  sanctionsConsent: true,
  requestsCredit: false,
};

// fixed "now" = 2026-06-13 for deterministic age math
const NOW = Math.floor(Date.parse("2026-06-13T00:00:00Z") / 1000);

describe("evaluateCompliance", () => {
  it("approves a clean US applicant with verified ID (tier 2)", () => {
    const d = evaluateCompliance(base, NOW);
    expect(d.approved).toBe(true);
    expect(d.policy.canDeposit).toBe(true);
    expect(d.policy.canBorrow).toBe(false); // didn't request credit
    expect(d.policy.tier).toBe(2);
    expect(d.policy.expiry).toBeGreaterThan(NOW);
  });

  it("grants credit (tier 3) when requested with verified ID in a normal jurisdiction", () => {
    const d = evaluateCompliance({...base, requestsCredit: true}, NOW);
    expect(d.policy.canBorrow).toBe(true);
    expect(d.policy.tier).toBe(3);
  });

  it("deposit-only band (tier 1) without a verified ID", () => {
    const d = evaluateCompliance({...base, governmentIdHash: undefined, requestsCredit: true}, NOW);
    expect(d.approved).toBe(true);
    expect(d.policy.tier).toBe(1);
    expect(d.policy.canBorrow).toBe(false);
  });

  it("rejects a sanctioned jurisdiction", () => {
    const d = evaluateCompliance({...base, country: "KP"}, NOW);
    expect(d.approved).toBe(false);
    expect(d.policy.canDeposit).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/sanctioned/i);
  });

  it("rejects an SDN name match", () => {
    const d = evaluateCompliance({...base, fullName: "Blocked Person"}, NOW);
    expect(d.approved).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/SDN|sanctions/i);
  });

  it("rejects under-18 applicants", () => {
    const d = evaluateCompliance({...base, dateOfBirth: "2015-01-01"}, NOW);
    expect(d.approved).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/under 18/i);
  });

  it("requires sanctions-screening consent", () => {
    const d = evaluateCompliance({...base, sanctionsConsent: false}, NOW);
    expect(d.approved).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/consent/i);
  });

  it("allows deposit but not credit in a high-risk jurisdiction", () => {
    const d = evaluateCompliance({...base, country: "VE", requestsCredit: true}, NOW);
    expect(d.approved).toBe(true);
    expect(d.policy.canDeposit).toBe(true);
    expect(d.policy.canBorrow).toBe(false);
  });

  it("emits a deterministic jurisdiction tag and never returns raw PII", () => {
    const d = evaluateCompliance(base, NOW);
    expect(d.policy.jurisdiction).toBe(jurisdictionTag("US", "NY"));
    // the policy object exposes only tier/booleans/jurisdiction/expiry
    expect(Object.keys(d.policy).sort()).toEqual(
      ["canBorrow", "canDeposit", "expiry", "jurisdiction", "tier"].sort(),
    );
  });
});
