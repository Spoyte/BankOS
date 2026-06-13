import {fromUsdc} from "@charter/shared";
import type {BankInfo} from "./contracts";
import {POLICY_URL} from "../config";

export interface ClaudeReview {
  rationale: string[];
  risk: "low" | "medium" | "high";
  concur: boolean;
  note: string;
}

/** Optional Claude-backed review of the deterministic proposal. Returns null when the policy service
 *  has no ANTHROPIC_API_KEY configured (the deterministic rationale is then used as-is). */
export async function fetchClaudeReview(bank: BankInfo, proposal: TreasuryProposal): Promise<ClaudeReview | null> {
  if (proposal.action === "hold") return null;
  try {
    const res = await fetch(`${POLICY_URL}/agent/treasury`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        bankName: bank.name,
        action: proposal.action,
        amountUsdc: fromUsdc(proposal.amount),
        state: {
          deposits: fromUsdc(bank.totalDeposits),
          idle: fromUsdc(bank.idleLiquidity),
          deployed: fromUsdc(bank.strategyAssets),
          pendingWithdrawals: fromUsdc(bank.totalPendingWithdraw),
          utilizationPct: Number(bank.utilizationBps) / 100,
          bufferTargetPct: 25,
        },
      }),
    });
    const json = await res.json();
    return json.claudeBacked ? (json.review as ClaudeReview) : null;
  } catch {
    return null;
  }
}

/**
 * Charter Treasury Agent — an autonomous policy engine that proposes how to deploy a bank's idle
 * reserve into yield while preserving a liquidity buffer. It only *proposes*; a human steward approves
 * the move on a Ledger device (Clear Signing) before it settles on-chain. That human-in-the-loop,
 * device-backed approval is the Ledger AI-agent pattern: the agent reasons, the steward signs.
 *
 * Deterministic by default (fully runnable offline). The same proposal shape can be produced by an
 * LLM-backed agent (see POLICY_URL /agent/treasury) without changing the UI.
 */

export type AgentAction = "allocate" | "redeem" | "hold";

export interface TreasuryProposal {
  action: AgentAction;
  amount: bigint; // USDC base units
  headline: string;
  rationale: string[];
  projected: {idleAfter: bigint; deployedAfter: bigint};
  risk: "low" | "medium" | "high";
  requiresLedger: boolean;
}

export interface AgentPolicy {
  /** Target liquidity buffer as a fraction of deposits (bps). Default 25%. */
  bufferBps: number;
  /** Don't propose moves smaller than this (base units). Default 1,000 USDC. */
  minMove: bigint;
  /** Moves above this require Ledger device approval. Default 10,000 USDC. */
  ledgerCap: bigint;
}

const DEFAULT_POLICY: AgentPolicy = {
  bufferBps: 2500,
  minMove: 1_000_000_000n, // 1,000 USDC
  ledgerCap: 10_000_000_000n, // 10,000 USDC
};

const usd = (v: bigint) => `${fromUsdc(v)} USDC`;

export function proposeTreasuryMove(bank: BankInfo, policy: Partial<AgentPolicy> = {}): TreasuryProposal {
  const p = {...DEFAULT_POLICY, ...policy};
  const idle = bank.idleLiquidity;
  const deployed = bank.strategyAssets;
  const pending = bank.totalPendingWithdraw;

  // Liquidity that must stay idle: escrowed withdrawals + a buffer over deposits.
  const buffer = (bank.totalDeposits * BigInt(p.bufferBps)) / 10_000n;
  const desiredIdle = pending + buffer;
  const utilPct = Number(bank.utilizationBps) / 100;

  const rationale: string[] = [
    `Idle reserve ${usd(idle)}, deployed ${usd(deployed)}, deposits ${usd(bank.totalDeposits)}.`,
    `Target liquidity buffer ${usd(desiredIdle)} = ${p.bufferBps / 100}% of deposits${pending > 0n ? ` + ${usd(pending)} pending withdrawals` : ""}.`,
    `Loan-to-deposit ${utilPct}% (cap ${bank.risk.maxUtilizationBps / 100}%).`,
  ];

  if (!bank.products.yield) {
    return {action: "hold", amount: 0n, headline: "Yield product disabled", rationale: ["This bank has the yield product turned off; no treasury action is available."], projected: {idleAfter: idle, deployedAfter: deployed}, risk: "low", requiresLedger: false};
  }
  if (bank.paused) {
    return {action: "hold", amount: 0n, headline: "Bank is paused", rationale: ["The bank is paused — the agent will not propose treasury moves until it resumes."], projected: {idleAfter: idle, deployedAfter: deployed}, risk: "low", requiresLedger: false};
  }

  // Over-deployed: idle below the buffer → redeem to top up liquidity.
  if (idle < desiredIdle) {
    const need = desiredIdle - idle;
    const amount = need > deployed ? deployed : need;
    if (amount < p.minMove || amount === 0n) {
      return hold(idle, deployed, [...rationale, "Idle is slightly below target but within tolerance — holding."]);
    }
    rationale.push(`Idle is ${usd(need)} below the buffer. Recommend redeeming ${usd(amount)} from the yield vault to restore liquidity.`);
    const risk: TreasuryProposal["risk"] = utilPct > bank.risk.maxUtilizationBps / 100 - 10 ? "high" : "medium";
    return {
      action: "redeem",
      amount,
      headline: `Redeem ${usd(amount)} to restore the liquidity buffer`,
      rationale,
      projected: {idleAfter: idle + amount, deployedAfter: deployed - amount},
      risk,
      requiresLedger: amount > p.ledgerCap,
    };
  }

  // Excess idle → deploy into yield.
  const deployable = idle - desiredIdle;
  if (deployable >= p.minMove) {
    rationale.push(`${usd(deployable)} sits above the buffer earning nothing. Recommend allocating it into the yield vault while keeping the full buffer liquid.`);
    const fractionDeployed = bank.totalAssets === 0n ? 0 : Number(((deployed + deployable) * 100n) / bank.totalAssets);
    const risk: TreasuryProposal["risk"] = fractionDeployed > 80 ? "high" : fractionDeployed > 60 ? "medium" : "low";
    return {
      action: "allocate",
      amount: deployable,
      headline: `Deploy ${usd(deployable)} of idle reserve into yield`,
      rationale,
      projected: {idleAfter: idle - deployable, deployedAfter: deployed + deployable},
      risk,
      requiresLedger: deployable > p.ledgerCap,
    };
  }

  return hold(idle, deployed, [...rationale, "Idle reserve is within the target band — no action needed."]);
}

function hold(idle: bigint, deployed: bigint, rationale: string[]): TreasuryProposal {
  return {
    action: "hold",
    amount: 0n,
    headline: "Reserves are balanced — hold",
    rationale,
    projected: {idleAfter: idle, deployedAfter: deployed},
    risk: "low",
    requiresLedger: false,
  };
}
