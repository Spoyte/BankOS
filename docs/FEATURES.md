# Feature-ideas implementation status

Tracks the parent [`../../docs/FEATURE-IDEAS.md`](../../docs/FEATURE-IDEAS.md) against the Charter build.

| # | Feature | Status |
|---|---|---|
| 1 | **AI treasury agent + Ledger human-in-the-loop** | ✅ shipped |
| 2 | Private balance by default | ⬜ |
| 3 | Yield-bearing deposits (steward spread) | ✅ shipped |
| 4 | Cross-chain deposit via LI.FI | ⬜ |
| 5 | Gasless onboarding (Dynamic AA/paymaster) | ⬜ |
| 6 | Recurring private payments / payroll | ⬜ |
| 7 | Selective-disclosure statements | ⬜ |
| 8 | Reputation-based credit | ⬜ |
| 9 | Inter-bank settlement | ⬜ |
| 10 | Multi-currency (EURC) + FX | ⬜ |

## #1 — AI treasury agent + Ledger human-in-the-loop ✅

An autonomous treasury policy engine reasons over the bank's live on-chain state and **proposes** how to
deploy idle reserve into yield (or redeem to restore a liquidity buffer); the steward **approves on a
Ledger device** (Clear Signing) before it settles on-chain. The agent proposes, the human signs — the
exact Ledger AI-agent pattern.

- `packages/web/src/lib/treasuryAgent.ts` — the reasoning engine (buffer policy, risk grading, rationale).
- `packages/web/src/views/StewardPanel.tsx` `TreasuryAgentCard` — surfaces the proposal + reasoning and
  routes execution through the existing Ledger Clear-Signing gate → real `allocateToStrategy` /
  `redeemFromStrategy` tx.
- Composes onto already-built rails: `ExecutionRouter` (allow-list), `Bank.allocateToStrategy` (action),
  the steward role (approver), and the `ledger/` Clear-Signing layer (now on by default).
- Deterministic and offline-runnable; the proposal shape leaves a clean seam for an LLM-backed agent.
