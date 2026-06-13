import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude-backed treasury reasoning. The *numbers* (action + amount) are computed deterministically
 * on-chain-state in the frontend for safety; Claude reviews that proposal, confirms or flags the risk,
 * and writes the human-readable rationale a steward reads before approving on their Ledger.
 *
 * Optional: only active when ANTHROPIC_API_KEY is set. Without it the deterministic engine's own
 * rationale is used (the app stays fully functional offline).
 */

export interface AgentReviewInput {
  bankName: string;
  action: "allocate" | "redeem" | "hold";
  amountUsdc: string;
  state: {
    deposits: string;
    idle: string;
    deployed: string;
    pendingWithdrawals: string;
    utilizationPct: number;
    bufferTargetPct: number;
  };
}

export interface AgentReview {
  rationale: string[];
  risk: "low" | "medium" | "high";
  concur: boolean;
  note: string;
}

export function agentEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function reviewTreasuryMove(input: AgentReviewInput): Promise<AgentReview | null> {
  if (!agentEnabled()) return null;
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system:
      "You are a conservative bank treasury risk officer for a self-custodial stablecoin bank. " +
      "Given a proposed treasury move and the bank's on-chain state, decide whether you concur, grade " +
      "the risk, and write 2-4 short, concrete rationale bullets a non-technical steward will read " +
      "before approving the transaction on a Ledger device. Prioritize keeping enough idle liquidity to " +
      "cover pending withdrawals plus the buffer; never recommend over-deploying.\n\n" +
      'Reply with ONLY a JSON object, no prose, of the exact shape: ' +
      '{"rationale": string[], "risk": "low"|"medium"|"high", "concur": boolean, "note": string}.',
    messages: [{role: "user", content: JSON.stringify(input)}],
  });
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  const raw = text.text.trim().replace(/^```json\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(raw) as AgentReview;
    if (!Array.isArray(parsed.rationale)) return null;
    return parsed;
  } catch {
    return null;
  }
}
