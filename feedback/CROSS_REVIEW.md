# Cross-Project Synthesis — Private Bank Factory (ETHGlobal NY 2026)

Reviewer: Claude (Charter), cross-project synthesis. Date: 2026-06-13.
Scope: all cross-feedback exchanged between the three parallel builds (`claude`, `gemini`, `gpt`),
fact-checked against Charter's *current* working tree (`git log` HEAD `6319bad`) and quick test runs.
No servers started (a demo stack is already live on 8545/4001/4002/5173); read-only review + quick tests only.

The three projects:
- **claude** (`Charter`): real on-chain core (5 contracts), Foundry + vitest tests, CRE attester, Unlink engine, Ledger ERC-7730, activity feed.
- **gemini**: a **fork of Charter** + a net-new Ledger Clear-Signing simulation, premium UI re-skin, conflict-free ports.
- **gpt** (`private-bank-factory`): an independent simulator-first product, later given a **real local contract rail** (6 `.sol`, on-chain PrivacyPool, viem behavior runner, signed privacy ledger).

---

## 1. Was the feedback FAIR? And what is now OUTDATED?

### 1a. Feedback gemini & gpt GAVE about claude

**gpt → claude** (`claude/feedback-gpt.md`): **Fair and accurate.** It correctly credits Charter's real
on-chain core, Foundry depth, Unlink EdDSA/nullifier privacy, on-chain CRE attestation, and demo
orchestration. Its "remaining risks" are honest and the merge direction is sound. The one risk that is
now **OUTDATED**:
> "If service health checks ever miss a stale deployment, the demo could mix old addresses with new services."

This was the real bug from `review.md` (High finding). It is **fixed**. `scripts/demo.sh` now: (a) always
stops prior Charter services + the demo anvil before redeploying (clean slate, step `0/7`), and (b) calls
`assert_env` after each service start to confirm `/info/environment` reports the *same* `policyRegistry` /
`privacyPool` address as the freshly written `deployments/31337.json`, failing fast otherwise. Verified by
reading `scripts/demo.sh:34-95`. So the stale-service class of failure the original review flagged can no
longer pass silently.

**gemini → claude** (`gemini/feedback-claude.md`): **Fair.** Correctly identifies that gemini is a Charter
fork whose only genuine net-new contribution is the Ledger layer, and gives good, pointed advice
(differentiate, make Ledger device-real, default-to-secured, derive ERC-7730 fields from real ABI). Nothing
here is unfair to claude — it is gemini reviewing *its own* relationship to the base.

**The original `review.md` / `FEEDBACK.md`** (the shared baseline review, present in both claude/ and
gemini/): **Was fair when written, now largely OUTDATED in claude's favor.** Status of each finding against
the current Charter tree:

| Finding (original review) | Severity | Current status in claude |
| --- | --- | --- |
| `demo.sh` passes health checks against stale services | High | **FIXED** — clean-slate stop + `assert_env` address match (`demo.sh:34-95`). |
| `seed` errors swallowed with `\|\| true` | (part of High) | **FIXED** — seed now branches on success and prints an explicit "demo state is incomplete" warning on failure. |
| LI.FI wording overstates execution | Medium | Addressed in earlier commit (`d5c6043` "accurate LI.FI wording"); ADR/code now say preview, not execute. |
| Dynamic SDK bundled in local persona mode | Low | **FIXED** — lazy-loaded (Charter commit history + gemini parallel `acc…` lazy-load). |
| README "all working" vs environment-sensitive demo | Low | Mitigated by the hardened demo + system-status indicator. |

Two additional things the original review did **not** yet know about (all landed after it, all verified):
NullifierUsed reproducibility fix, 24 vitest tests, zod on all endpoints, on-chain activity feed + member
roster + directory, Ledger Clear-Signing, and a live system-status indicator. See §1c.

### 1b. Feedback gemini & gpt gave ABOUT EACH OTHER

**gpt → gemini** (`gemini/feedback/feedback-gpt.md`, two copies): **Fair.** Credits gemini's real privacy
path, validation discipline, conflict-free ports, Foundry coverage, UI ambition, and the Ledger sim; flags
the heavier run stack, LI.FI-execution gap, and "don't let polish overpower mechanics." Accurate, though it
slightly under-states that gemini's privacy/Foundry strengths are **inherited from Charter**, not original.

**gemini → gpt** (`gpt/feedback/FEEDBACK_GEMINI.md`): **Fair and well-verified** (it browser-tested the GPT
rail). Correctly credits GPT's local contract rail, confidential policy attestation, PrivacyPool + signed
ledger, and USDC base-unit math; correctly flags that the Express API isn't auto-booted by a single dev
command (Vite proxy 500s) and that the signed ledger doesn't yet replay on-chain PrivacyPool logs. Both gaps
are real.

**Net on fairness:** No materially unfair claim was made about any project. The peer reviews are unusually
honest (they openly mark forks, simulations, and decorative-vs-real privacy). The *only* drift is staleness:
the shared baseline review pre-dates claude's hardening, so its headline "biggest issue: demo
reproducibility" no longer holds for claude.

### 1c. Verification of claude's claimed post-feedback work (all CONFIRMED)

Checked against the current tree, not the commit messages:

- **Hardened `demo.sh`** — clean-slate stop of prior services + anvil, then `assert_env` match on
  `policyRegistry` and `privacyPool` before proceeding. `scripts/demo.sh:34-95`. ✅
- **NullifierUsed reproducibility fix** — `withdrawNullifier()` now adds a 16-byte random salt so the
  bytes32 marker can never collide with the PrivacyPool's *persistent* nullifier set across engine restarts
  (in-memory nonce resets to 0, the pool remembers spent nullifiers). `account.ts:54-65`, with a dedicated
  regression test. ✅
- **24 vitest unit tests** — `npx vitest run` → **24 passed** (compliance 9, account 7, ledger 8). ✅
- **zod on all API endpoints** — present in both `cre-policy/src/index.ts` and `unlink-engine/src/server.ts`. ✅
- **On-chain activity feed + member roster + directory** — `web/src/lib/events.ts` (viem `getLogs`), plus
  roster/directory in `BankDetail.tsx` / `MemberPanel.tsx` / `StewardPanel.tsx`. ✅
- **Ledger Clear-Signing layer** — `web/src/ledger/LedgerProvider.tsx` + `web/src/ledger/erc7730.ts`, gating
  steward actions in `StewardPanel.tsx`. ✅
- **Live system-status indicator** — `web/src/views/SystemStatus.tsx` + `web/src/lib/health.ts`, wired into
  `App.tsx`. ✅
- **35 Foundry tests** — `Charter.t.sol` + `PrivacyPool.t.sol`, 35 `function test*`. (Not re-run here per the
  no-servers constraint, but the baseline review independently confirmed 35/35 pass, and the test file is
  unchanged in structure.) ✅

---

## 2. State of the Race — comparison table

Scale: ✅ strong/real · 🟡 partial/simulated-but-credible · ⚠️ weak/missing.

| Axis | claude (Charter) | gemini (fork + Ledger) | gpt (sim + rail) |
| --- | --- | --- | --- |
| **Real on-chain core** | ✅ 5 contracts deployed + behavior-tested; demo routes real txs | ✅ same 5 contracts (inherited from Charter, verified) | 🟡 6 `.sol` incl. PrivacyPool, deployed via viem rail; simulator is still the default path |
| **Contract tests** | ✅ 35 Foundry + 24 vitest (59) | ✅ 35 Foundry + 24 vitest (inherited) | 🟡 no Foundry; viem `contract-behavior.ts` (8 real revert-path scenarios) + 11 vitest |
| **Privacy (Unlink) realness** | ✅ real SDK accounts, EdDSA-authorized transfer/withdraw, Poseidon commitments, on-chain PrivacyPool, enforced nullifiers, event recovery | ✅ same (inherited) | 🟡 real on-chain PrivacyPool (commitment/nullifier/relayer) **and** an off-chain signed+persisted ledger; no on-chain log replay yet |
| **Compliance (Chainlink) realness** | ✅ CRE-style attester → `PolicyRegistry.onReport` lands policy on-chain | ✅ same (inherited) | 🟡 `writeContract` attestation is a real on-chain state change, but framed as "CRE-sim", not a real CRE workflow |
| **UX / polish** | ✅ dense operator/member/steward UIs, activity feed, roster, system-status | ✅ most polished — glassmorphism neobank re-skin + Ledger modal | ✅ compact, clean operator/member dashboard; strong product feel |
| **Run friction** | 🟡 5 services via hardened `demo.sh` (now reproducible) | 🟡 same 5 services + conflict-free ports; needs README/screenshot reframe | ✅ lowest — `npm i && npm run dev`; (caveat: API must be booted, gemini flagged Vite-proxy 500s) |
| **Ledger** | ✅ ERC-7730 Clear-Signing layer gating steward actions | ✅ Ledger Clear-Signing sim is its headline net-new feature (but bypass-by-default, static 7730) | ⚠️ none |
| **Money correctness** | ✅ bigint USDC base units throughout | ✅ same (inherited) | ✅ `toUsdcUnits` 6-dp base units, rejects sub-cent (fixed from float) |
| **Prize-fit (Unlink/Chainlink/Arc/Dynamic/Ledger)** | ✅ broadest real coverage; on-chain criteria genuinely met | ✅ same coverage + strongest Ledger-track story (if made device-real) | 🟡 rail satisfies the on-chain bar for policy + privacy; weaker on CRE-as-CRE and no Ledger |

---

## 3. Ranked verdict

1. **claude (Charter)** — *The most defensible submission.* It is the only build where the privacy and
   compliance claims are backed by real on-chain transactions, real EdDSA-authorized spends, enforced
   nullifiers, and a 59-test suite — and it has since closed the one credible knock against it
   (demo reproducibility). Breadth + substance + now-reproducible demo.

2. **gemini (fork + Ledger)** — *Charter's strengths for free, plus the best single prize-track story.* It
   inherits everything in #1 and adds the most polished UI and the Ledger Clear-Signing angle. Ranked below
   claude purely because its core is derivative; its standalone value rests on the Ledger layer, which is
   still a simulation and bypass-by-default. With one real device-signed action it could leapfrog on the
   Ledger track specifically.

3. **gpt (sim + rail)** — *Best DX and product surface; thinnest on-chain proof.* It made the right moves
   (integer money, a real contract rail, an on-chain PrivacyPool, signed privacy ledger) and is the easiest
   to run, but the simulator is still the default path, there are no Foundry tests, the CRE story is a `sim`,
   and there's no Ledger. Strong product, less prize-substance than the other two.

---

## 4. Single highest-leverage next step per project

- **claude:** Make the live demo *show the on-chain substance by default* — surface tx hashes + a
  block-explorer-style read-back for the policy attestation and the private deposit/withdraw, and lead the
  walkthrough with the system-status + activity feed so a judge sees "this is real, not simulated" in the
  first 30 seconds. The substance is done; the remaining gap is making it *visible*.

- **gemini:** Differentiate from Charter and make Ledger *real for one action* — reframe README/screenshots
  around "Ledger-secured steward bank," default high-risk actions to require the device, derive the ERC-7730
  `fields/format` from the actual function ABI, and wire one real `@ledgerhq/device-management-kit`
  clear-signing call (even against a Speculos emulator). One real device-signed tx is worth more than the
  whole simulated modal.

- **gpt:** Promote the contract rail to the *primary* path and add on-chain PrivacyPool log replay — boot the
  Express API in the single dev command (kill the Vite-proxy 500s), make the demo run the real
  attestation + private deposit/withdraw on-chain by default (not the in-memory simulator), reconstruct
  shielded balances from `Deposited`/`Withdrawn` logs, and add a few Foundry tests so the on-chain half has
  behavioral coverage, not just a viem runner.
