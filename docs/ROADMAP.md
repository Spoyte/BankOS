# BankOS — Roadmap / what's left

Status legend: ✅ done · 🟡 in progress · ⬜ todo · �groups what needs **you** (external resources).

## Tier 1 — submission-critical (needs you 🔑)

| # | Item | Status | Needs from you |
|---|---|---|---|
| 1 | Deploy contracts to **real Arc testnet** (`rpc.testnet.arc.network`, 5042002, USDC `0x3600…`) | ✅ | Live; addresses in `packages/contracts/deployments/5042002.json`. Read-back proof: `bash scripts/verify-arc.sh`. |
| 2 | **Host the web app** (Vercel) so judges can use it | ✅ | Live at <https://bank-os-cre-policy.vercel.app>; backends on Fly. |
| 3 | **Record a demo video** | ⬜ | You (screen-record the flow); I'll write the script |
| 4 | **Run the real Chainlink CRE workflow** (`cre workflow simulate`) | 🟡 | Runs in the CRE simulator (WASM, HTTP-triggered, `writeReport`). **Not yet deployed to a live DON** — CRE agent active. |
| 5 | Configure a real **Dynamic environment ID** | ✅ | `VITE_DYNAMIC_ENVIRONMENT_ID` set in prod; passkey embedded-wallet onboarding enabled on the hosted app. |
| 6 | Point at the **hosted Unlink engine** (`LiveUnlinkClient`) | ⬜ | `UNLINK_ENGINE_URL` + `UNLINK_API_KEY` (else the Fly-hosted local emulator stays the demo path) |

## Tier 2 — engineering hardening (I can do now)

| # | Item | Status |
|---|---|---|
| 7 | **JS/TS unit tests** — engine ledger (EdDSA/nonce/nullifier) + compliance brain | ✅ (48 vitest tests across 7 files; + 4 `bun test` CRE workflow tests) |
| 8 | **zod validation** at policy + engine API boundaries | ✅ |
| 9 | **"Recent activity" feed** in the UI (on-chain events via `getLogs`) | ✅ |
| 10 | `anvil --state` persistence for restart-safe local demos | ✅ |
| 11 | Optional **SIM mode** (no anvil) for zero-dependency first run | 🟡 (live status indicator added — shows contract-backed vs offline; full in-memory fallback still todo) |
| 12 | Wire the **LI.FI burner execution** path (currently preview-only) | ⬜ |

## Tier 3 — product completeness (I can do now)

| # | Item | Status |
|---|---|---|
| 13 | **Member directory / address book** for `unlink1…` addresses | ✅ |
| 14 | **Steward member roster** + post-charter product **editing UI** | ✅ |
| 15 | **EURC** (Arc-native) multi-currency support | ✅ shipped (feature #10 — private USDC↔EURC FX in the shielded ledger) |
| 16 | `slither` security pass on the contracts | ⬜ |
| 17 | **Ledger Clear-Signing** simulation gating high-risk steward actions (ERC-7730, Ledger track) | ✅ |

## Done ✅

- 5 contracts + mocks, 40 Foundry tests + 48 vitest tests, deploy script, local-Anvil deploy, **live Arc-testnet deploy**.
- Chainlink CRE compliance: workflow runs in the CRE simulator (Confidential HTTP → `writeReport` → `onReport`) + local DON simulator (real on-chain attest). Live-DON deploy still open (Tier 1 #4).
- Unlink privacy: real SDK crypto + shielded ledger + on-chain `PrivacyPool`; shield→transfer→withdraw proven.
- Dynamic onboarding (local personas or real widget); operator/member/steward UIs.
- LI.FI PoC + ADR-001; feature-flagged route preview.
- Hardened `scripts/demo.sh` (clean-slate + env-match assertions); `npm run verify`; docs + screenshots.
