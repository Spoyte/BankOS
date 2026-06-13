# Charter — Roadmap / what's left

Status legend: ✅ done · 🟡 in progress · ⬜ todo · �groups what needs **you** (external resources).

## Tier 1 — submission-critical (needs you 🔑)

| # | Item | Status | Needs from you |
|---|---|---|---|
| 1 | Deploy contracts to **real Arc testnet** (`rpc.testnet.arc.network`, 5042002, USDC `0x3600…`) | ⬜ | A funded deployer private key (with Arc-testnet USDC for gas) |
| 2 | **Host the web app** (Vercel/Netlify) so judges can use it | ⬜ | Hosting account, or approve me to add a deploy config |
| 3 | **Record a demo video** | ⬜ | You (screen-record the flow); I'll write the script |
| 4 | **Run the real Chainlink CRE workflow** (`cre workflow simulate`) | ⬜ | `cre` CLI installed + a CRE account; I have the workflow ready |
| 5 | Configure a real **Dynamic environment ID** | ⬜ | A Dynamic dashboard env id (Arc network enabled) |
| 6 | Point at the **hosted Unlink engine** (`LiveUnlinkClient`) | ⬜ | `UNLINK_ENGINE_URL` + `UNLINK_API_KEY` (else local engine stays the demo path) |

## Tier 2 — engineering hardening (I can do now)

| # | Item | Status |
|---|---|---|
| 7 | **JS/TS unit tests** — engine ledger (EdDSA/nonce/nullifier) + compliance brain | ✅ (24 tests) |
| 8 | **zod validation** at policy + engine API boundaries | ⬜ |
| 9 | **"Recent activity" feed** in the UI (on-chain events via `getLogs`) | ⬜ |
| 10 | `anvil --state` persistence for restart-safe local demos | ⬜ |
| 11 | Optional **SIM mode** (no anvil) for zero-dependency first run | ⬜ |
| 12 | Wire the **LI.FI burner execution** path (currently preview-only) | ⬜ |

## Tier 3 — product completeness (I can do now)

| # | Item | Status |
|---|---|---|
| 13 | **Member directory / address book** for `unlink1…` addresses | ⬜ |
| 14 | **Steward member roster** + post-charter product/risk **editing UI** | ⬜ |
| 15 | **EURC** (Arc-native) multi-currency support | ⬜ |
| 16 | `slither` security pass on the contracts | ⬜ |

## Done ✅

- 5 contracts + mocks, 35 Foundry tests, deploy script, local-Arc deploy.
- Chainlink CRE compliance: workflow (Confidential HTTP → `onReport`) + local DON simulator (real on-chain attest).
- Unlink privacy: real SDK crypto + shielded ledger + on-chain `PrivacyPool`; shield→transfer→withdraw proven.
- Dynamic onboarding (local personas or real widget); operator/member/steward UIs.
- LI.FI PoC + ADR-001; feature-flagged route preview.
- Hardened `scripts/demo.sh` (clean-slate + env-match assertions); `npm run verify`; docs + screenshots.
