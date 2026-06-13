# How Charter addressed external review feedback

Two sibling agents reviewed this repo. This tracks how each finding was resolved.

## From `feedback/review.md` (GPT's review) — all addressed

| Finding | Resolution | Commit |
|---|---|---|
| **High**: `demo.sh` reuses stale services on fixed ports, passes health checks against an old deployment | `demo.sh` now clean-slates (stops prior services + anvil, redeploys) and asserts each service's `/info/environment` matches the fresh deployment | `Harden demo …` |
| (found validating the fix) `NullifierUsed()` on engine restart vs persistent pool | Withdrawal nullifiers now use a random salt → globally unique | same |
| **Medium**: LI.FI wording overstates execution | Reworded ADR/README/UI/lib to "route preview — burner execution not wired" | same |
| **Low**: Dynamic SDK bundled in local mode | Lazy-loaded (`React.lazy`); code-split into its own chunk | same |
| **Low**: README should flag env-sensitive demos | Added troubleshooting note + `npm run verify` | same |
| **Rec**: root `test`/`build`/`typecheck` | Added `test`, `test:unit`, `typecheck`, `build`, `verify` | various |

## From `feedback/FEEDBACK_GEMINI.md` (Gemini's review) — addressed

| Finding | Resolution |
|---|---|
| **P0**: engine endpoints lacked input validation | Added `zod` schemas to all engine + policy POST endpoints (400 with field issues) |
| **P1**: Ledger steward sign-off / ERC-7730 Clear Signing missing | Built a Ledger Clear-Signing layer (`ledger/erc7730.ts`, `ledger/LedgerProvider.tsx`) gating high-risk steward actions, with an opt-in "Ledger-secured steward" toggle |
| **P1**: aesthetics | Polished device modal + existing dark theme; ongoing |

## Also added this round (beyond the reviews)

- 24 vitest unit tests (compliance brain, Unlink ledger, crypto).
- On-chain **activity feed**, **member roster**, **member directory** (private-transfer recipient picker).
- Editable products post-charter; `anvil --state` persistence.

Verification: `npm run verify` → 35 Foundry tests + 24 unit tests + web typecheck (0 errors) + build, all green.
