import {parseEventLogs, type Address} from "viem";
import {abis} from "@charter/shared/abis";
import {fromUsdc} from "@charter/shared";
import {publicClient} from "../wallet/WalletContext";

export interface ActivityItem {
  type: string;
  label: string;
  who?: Address;
  amount?: string; // formatted USDC
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface MemberRow {
  address: Address;
  unlinkAccount: string;
}

const AMOUNT_KEYS = ["amount", "newBalance", "limit", "assets"];

function describe(eventName: string, args: any): {label: string; who?: Address; amount?: string} {
  const amtKey = AMOUNT_KEYS.find((k) => typeof args[k] === "bigint");
  const amount = amtKey ? fromUsdc(args[amtKey] as bigint) : undefined;
  switch (eventName) {
    case "Deposited": return {label: "Deposit", who: args.member, amount};
    case "WithdrawalRequested": return {label: "Withdrawal requested", who: args.member, amount};
    case "WithdrawalClaimed": return {label: "Withdrawal claimed", who: args.member, amount};
    case "WithdrawalCancelled": return {label: "Withdrawal cancelled", who: args.member, amount};
    case "Borrowed": return {label: "Borrowed", who: args.member, amount};
    case "Repaid": return {label: "Repaid", who: args.member, amount};
    case "CreditLineOpened": return {label: "Credit line opened", who: args.member, amount};
    case "StrategyAllocated": return {label: "Allocated to yield", amount};
    case "StrategyRedeemed": return {label: "Redeemed from yield", amount};
    case "MemberRegistered": return {label: "Member joined", who: args.member};
    case "PausedSet": return {label: args.paused ? "Bank paused" : "Bank resumed"};
    case "PrivateNoteAnchored": return {label: "Private note anchored", who: args.member};
    default: return {label: eventName};
  }
}

/** Recent on-chain activity for a bank (newest first). */
export async function getBankActivity(bank: Address, limit = 12): Promise<ActivityItem[]> {
  const logs = await publicClient.getLogs({address: bank, fromBlock: 0n});
  const decoded = parseEventLogs({abi: abis.Bank, logs});
  const items: ActivityItem[] = decoded
    .filter((l: any) => l.eventName !== "Initialized" && l.eventName !== "RiskConfigured" && l.eventName !== "ProductsConfigured")
    .map((l: any) => {
      const d = describe(l.eventName, l.args ?? {});
      return {type: l.eventName, label: d.label, who: d.who, amount: d.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash};
    });
  items.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));
  return items.slice(0, limit);
}

/** Members of a bank, from MemberRegistered events (latest unlink pointer per address). */
export async function getBankMembers(bank: Address): Promise<MemberRow[]> {
  const logs = await publicClient.getLogs({address: bank, fromBlock: 0n});
  const decoded = parseEventLogs({abi: abis.Bank, logs, eventName: "MemberRegistered"});
  const byAddr = new Map<string, MemberRow>();
  for (const l of decoded as any[]) {
    byAddr.set((l.args.member as string).toLowerCase(), {
      address: l.args.member as Address,
      unlinkAccount: l.args.unlinkAccount as string,
    });
  }
  return [...byAddr.values()];
}
