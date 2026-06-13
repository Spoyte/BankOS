import type {Address} from "viem";
import {POLICY_URL} from "../config";

export interface KycPayload {
  fullName: string;
  country: string;
  region?: string;
  dateOfBirth: string;
  governmentIdHash?: string;
  sanctionsConsent: boolean;
  requestsCredit?: boolean;
}

export interface ApplyResult {
  approved: boolean;
  reasons: string[];
  policy?: {tier: number; canDeposit: boolean; canBorrow: boolean; jurisdiction: string; expiry: number};
  txHash?: string | null;
}

/** Submit a KYC application to the Chainlink CRE policy service (local DON simulator). */
export async function applyForPolicy(bank: Address, member: Address, kyc: KycPayload): Promise<ApplyResult> {
  const res = await fetch(`${POLICY_URL}/apply`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({bank, member, kyc}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "policy apply failed");
  return json as ApplyResult;
}

export async function policyServiceHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${POLICY_URL}/health`);
    return r.ok;
  } catch {
    return false;
  }
}
