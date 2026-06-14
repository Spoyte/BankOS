import type {Address} from "viem";
import {ENGINE_URL} from "../config";

export interface SettlementRow {
  id: string;
  fromBank: string;
  toBank: string;
  token: string;
  amount: string; // base units
  memo: string;
  at: number;
}

export interface NetPosition {
  bankA: string;
  bankB: string;
  grossAToB: string;
  grossBToA: string;
  net: string;
  count: number;
}

/** Publish this bank's treasury settlement account so counterparties can discover it. */
export async function registerTreasury(bank: Address, unlinkAddress: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/settlement/treasury`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({bank, unlinkAddress}),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "register treasury failed");
}

/** Look up another bank's treasury settlement account (null if it hasn't set one up). */
export async function getTreasury(bank: Address): Promise<string | null> {
  const res = await fetch(`${ENGINE_URL}/settlement/treasury/${bank}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("treasury lookup failed");
  return (await res.json()).unlinkAddress as string;
}

export async function getSettlements(bank: Address): Promise<SettlementRow[]> {
  const res = await fetch(`${ENGINE_URL}/settlements/${bank}`);
  if (!res.ok) return [];
  return (await res.json()).settlements as SettlementRow[];
}

export async function getNet(bankA: Address, bankB: Address): Promise<NetPosition> {
  const res = await fetch(`${ENGINE_URL}/settlement/net/${bankA}/${bankB}`);
  return (await res.json()) as NetPosition;
}
