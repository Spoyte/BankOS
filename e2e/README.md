# End-to-end tests (Playwright)

These tests drive the **full local stack** — anvil (local Arc) + the Chainlink CRE policy service +
the Unlink engine + the seeded "Brooklyn Mutual" bank + the web app — through a real browser. Every
flow exercises **real on-chain transactions**; nothing is mocked.

## Run

```bash
# boot the stack once, then run the suite (reuses an already-running stack):
bash scripts/demo.sh
npm run test:e2e

# or boot-fresh + test in one shot (clean-slate redeploy + reseed):
npm run test:e2e:fresh
```

## What's covered (feature → spec)

| Spec | Feature proven |
|---|---|
| `01-discover` | Bank factory: discover/operator views, contract-backed status, charter form |
| `02-compliance` | **Chainlink CRE**: sanctioned country rejected, clean applicant approved → eligibility attested on-chain (PII never stored) |
| `03-member-private-yield` | **Private-by-default** balance, **yield-bearing** checking, and a real **Unlink** shield (derive account → shield USDC into the on-chain `PrivacyPool`) |
| `04-steward-agent-ledger` | **AI treasury agent** proposal + **Ledger** Clear-Signing gating a real on-chain steward action (set spread); yield harvest + credit controls |
| `05-ledger-clearsign` | **Ledger** ERC-7730 Clear-Signing modal: device screens, descriptor, approve/reject |

## Environment notes

This box runs an OS newer than Playwright 1.60's bundled Chromium supports, and has no ffmpeg, so the
config:

- drives the **system Google Chrome** via `channel: "chrome"` (no `playwright install` needed),
- launches with `--no-sandbox`,
- disables video capture (trace is kept on failure).

Tests run **serially on one worker** because they share a single chain, with `retries: 1` to absorb
transient nonce/RPC timing on the real stack.

## Note: the browser-privacy fix these tests forced

The "Set up private account" flow was **broken in the browser** (it only ever ran in the Node engine/CLI):
`@unlink-xyz/sdk` loads EdDSA via Node-only `createRequire(...)("@zk-kit/eddsa-poseidon/blake-2b")`
and the blake-2b code references the Node `Buffer` global. Fixed without patching `node_modules`:

- `packages/web/src/lib/eddsa-shim.ts` + `resolve.alias` in `vite.config.ts` (shim `createRequire`,
  alias zk-kit's CJS-only blake-2b build),
- `packages/web/src/polyfills.ts` (imported first in `main.tsx`) provides `Buffer`.
