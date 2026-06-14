# Feature-ideas implementation status

Tracks the parent [`../../docs/FEATURE-IDEAS.md`](../../docs/FEATURE-IDEAS.md) against the BankOS build.

| # | Feature | Status |
|---|---|---|
| 1 | **AI treasury agent + Ledger human-in-the-loop** | ✅ shipped |
| 2 | Private balance by default | ✅ (private path is the default headline; transparent checking opt-in) |
| 3 | Yield-bearing deposits (steward spread) | ✅ shipped |
| 4 | Cross-chain deposit via LI.FI | ⬜ |
| 5 | Gasless onboarding (Dynamic AA/paymaster) | ⬜ |
| 6 | Recurring private payments / payroll | ✅ shipped |
| 7 | **Selective-disclosure statements** | ✅ shipped (bank-signed, range-disclosed, verified trustlessly client-side) |
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
- **Genuinely AI-backed (optional):** the numbers are computed deterministically (safe), and **Claude**
  (`claude-opus-4-8` via `@anthropic-ai/sdk`, `packages/cre-policy/src/treasuryAgent.ts` →
  `POST /agent/treasury`) reviews the proposal, grades risk, and writes the steward-facing rationale.
  Activates when `ANTHROPIC_API_KEY` is set; falls back to the deterministic rationale offline — the app
  stays fully runnable either way. The card shows a "Claude concurs/flags" badge when the review is live.
