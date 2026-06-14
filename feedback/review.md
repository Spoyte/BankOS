# Review Feedback For Claude Implementation

Date: 2026-06-13

## Summary

Claude's `Charter` implementation is materially stronger than a frontend-only or API-simulator demo. It has real Foundry contracts, a local Chainlink-style attester that lands on-chain policy, a local Unlink engine with SDK cryptography, a PrivacyPool relayer path, Dynamic wallet support, and a documented LI.FI decision. The architecture matches the `gpt.md` brief well and avoids the Canton/Ledger paths.

The main issue is not the core architecture. It is demo reproducibility: the one-command demo can report success while reusing stale services from an earlier deployment, which can break the privacy proof and mislead a judge/operator.

## Verified

- `npm run contracts:test` passed: 35 Foundry tests, 0 failures.
- `npm run lifi:poc` passed with network access: Arc Testnet is listed, same-chain USDC-to-EURC calldata is available, cross-chain Arbitrum-to-Arc was unavailable.
- `npm -w @bankos/web run typecheck` passed in the current working tree.
- `npm -w @bankos/web run build` passed in the current working tree.
- `bash scripts/demo.sh` deployed contracts and seeded a bank, but hit stale-service issues described below.

## Findings

### High: `demo.sh` can pass health checks against stale services

`scripts/demo.sh` starts services on fixed ports and then checks only that `http://127.0.0.1:4001/health` and `:4002/health` respond (`scripts/demo.sh:51-59`). In my run, both new service starts failed with `EADDRINUSE`, but `wait_for` still passed because old services were already listening. The new deployment wrote a new `PrivacyPool`, while the old engine still pointed at the old pool. The privacy CLI then failed on withdrawal with `InsufficientPool()`.

Related script risks:

- The script does not stop old services before redeploying (`scripts/demo.sh:31-44`).
- `wait_for` only tests liveness, not that the service's deployment addresses match the current `deployments/31337.json` (`scripts/demo.sh:16-18`).
- `seed` errors are swallowed with `|| true` (`scripts/demo.sh:61-63`).
- The printed web URL can be stale if the Vite process exits after writing its ready line (`scripts/demo.sh:65-76`).

Suggested fix:

- Add a `--fresh` default path that calls a scoped stop before deploy, or fail fast if the ports are occupied by a service whose `/info/environment` does not match the current deployment.
- Validate `policyRegistry`, `privacyPool`, `usdc`, and relayer addresses after service start.
- Remove `|| true` from seed or explicitly mark the demo as partial.
- Check that the web URL still responds before printing "demo is up".

### Medium: LI.FI stretch wording overstates execution

The ADR says the LI.FI module "composes the returned calldata into the Unlink burner flow" (`docs/ADR-001-lifi-poc.md:38-40`). The current web module only fetches and displays quote calldata (`packages/web/src/lib/lifi.ts:16-36`), and the steward card previews the route rather than executing it.

Suggested fix:

- Reword to "previews calldata intended for the Unlink burner flow" unless an actual burner/execute transaction is wired.
- Or add a disabled "execute via burner" path with a clear guard explaining missing live engine requirements.

### Low: Dynamic SDK is bundled in local persona mode

`WalletContext.tsx` statically imports `DynamicWalletProvider` (`packages/web/src/wallet/WalletContext.tsx:6`), and `DynamicWallet.tsx` imports the Dynamic SDK at module load (`packages/web/src/wallet/DynamicWallet.tsx:3-4`). This makes the default local-persona build carry the large Dynamic dependency even when `VITE_DYNAMIC_ENVIRONMENT_ID` is unset.

Suggested fix:

- Lazy-load the Dynamic provider only when `DYNAMIC_ENV_ID` is present.
- Keep the local wallet provider as the default synchronous path.

### Low: README should distinguish verified core from environment-sensitive demos

The README says "What's built (all working)" and "CLI demo proves shield -> private transfer -> withdraw" (`README.md:29-39`, `README.md:62-67`). The claim is directionally fair for the code, but the command can fail under stale local services.

Suggested fix:

- Keep the stronger claim after hardening `demo.sh`.
- Until then, add a troubleshooting note: run `bash scripts/demo.sh stop` first, verify `/info/environment`, then run the privacy demo.

## What Claude Did Well

- Built real on-chain primitives instead of only modeling behavior in an API store.
- Added a strong Foundry test suite covering policy gating, caps, withdrawals, credit, yield, pause, membership, and privacy pool nullifiers.
- Modeled Chainlink CRE credibly with both `PolicyRegistry.onReport` and a local attester service.
- Used actual Unlink SDK cryptography for account derivation, Poseidon commitments, and EdDSA signatures.
- Made the LI.FI decision nuanced: same-chain Arc routing works, cross-chain into Arc does not, Composer is not public.
- Added practical demo docs, screenshots, deploy artifacts, ABI export, and a one-command script.

## Recommended Next Steps

1. Harden `scripts/demo.sh` so it cannot mix old services with new deployments.
2. Re-run `npm run -w @bankos/unlink-engine demo` from a fresh stack and record the output in `docs/`.
3. Make LI.FI language match the current implementation, or wire the actual optional execution path.
4. Lazy-load Dynamic in the web app to reduce the default local build.
5. Add root-level `test`, `build`, and `typecheck` scripts so one command verifies contracts plus web type safety.
