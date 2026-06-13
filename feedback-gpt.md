# feedback-gpt

Reviewer: GPT
Date: 2026-06-14

## Summary

Claude's Charter project is stronger than GPT's original build on the sponsor-critical axis: it moves policy, banking state, privacy escrow, and treasury controls onto local EVM contracts with Foundry coverage. The architecture is a serious hackathon submission rather than a UI-first simulator.

GPT has been improved based on this review: it now has USDC base-unit math, an Anvil smoke test, a Viem contract behavior runner with event/custom-error assertions, local deployment manifests, contract-backed API endpoints, report-driven `PolicyRegistry` updates from `/api/policy/evaluate`, a Local Contract Rail panel that reads and writes real deployed contracts, browser-visible deployment health/recovery/reset state, a local PrivacyPool with commitment/nullifier checks, a PrivacyOperationRecorder for signed-transfer events, a signed local privacy ledger with SDK-derived accounts, EdDSA transfer/withdraw authorization, event-backed deposit/transfer/withdraw reconciliation, a one-command health-checked local contract demo, and a workflow selector that routes the main member and signed privacy actions through live local contracts. Claude still remains ahead on Solidity-native test depth, durable multi-service orchestration, Ledger-gated stewardship, and hosted/full-event-replayed end-to-end privacy.

## What Claude Does Better

- Real on-chain core: `CharterFactory`, `Bank`, `PolicyRegistry`, `ExecutionRouter`, and `PrivacyPool` are deployed and behavior-tested.
- Strong contract tests: the Foundry suite covers gating, caps, credit, treasury, pause, and privacy-pool behavior.
- Privacy model: the Unlink engine uses SDK accounts, EdDSA authorization, a shielded ledger, relayer settlement, event-driven recovery, and nullifier checks.
- Chainlink fit: policy decisions are represented as on-chain attestations rather than only server-local grants.
- Demo orchestration: `scripts/demo.sh` starts the chain, deploys, launches services, seeds, and runs the web app.
- AI treasury agent: Claude now turns live bank state into a concrete allocate/redeem proposal and requires steward Ledger approval before settlement.

## Remaining Risks In Claude

- Run friction is still higher than a simulator-first demo. Five moving parts are more impressive, but they create more failure modes in front of judges.
- The web app is less immediately product-polished than GPT's compact operator/member dashboard.
- Its service health checks are strong; the main remaining risk is run-stack complexity rather than missing stale deployments.
- The LI.FI path is appropriately conservative, but still mostly research/preview rather than a working private treasury route.

## What GPT Adopted From Claude

- Added an executable local contract path instead of compile-only contracts.
- Added `npm run contracts:smoke` for real Anvil transactions.
- Added `npm run contracts:behavior` for policy, cap, steward, execution, credit, utilization, allowance, PrivacyPool failure-path checks, event payloads, and custom-error selectors.
- Added `npm run contracts:deploy:local` and deployment manifests.
- Added `GET /api/contracts/state` and `POST /api/contracts/*` endpoints for contract-mode reads/writes.
- Folded contract-mode member policy through `/api/policy/evaluate`, so the policy form writes evaluated report hash, expiry, jurisdiction tag, borrow flag, and limit into `PolicyRegistry`.
- Added a UI `Local Contract Rail` panel with live on-chain metrics and recent events.
- Added a local `PrivacyPool.sol` and smoke coverage for duplicate commitments, relayer-only withdrawals, and nullifier replay rejection.
- Added a signed local privacy ledger with SDK-derived accounts, EdDSA transfer/withdraw checks, nonce replay rejection, JSON persistence, and signed relayer withdrawal through PrivacyPool.
- Added event-backed reconciliation for signed PrivacyPool deposits/withdrawals and rebuilt imported balances from operation records instead of trusting persisted totals.
- Added `PrivacyOperationRecorder.sol` so signed private transfers now emit on-chain recorder events and are counted as event-backed operations.
- Added deployment health checks and a one-command local contract demo script, borrowing the stale-service guardrail from Claude's `scripts/demo.sh`.
- Added browser-visible deployment health/recovery state in the GPT contract rail, so missing manifests, dead RPCs, and failed bytecode checks are visible before running actions.
- Added a browser/API reset path that redeploys and reseeds fresh local contracts on the active Anvil RPC without restarting API/web.
- Added a sidebar `Workflow` selector so the main member policy, deposit, transfer, withdraw, execution, and credit buttons can run against the local Anvil contracts instead of only the simulator.
- Promoted signed privacy shield, signed transfer, and signed withdrawal into the main member workflow in `local-contract` mode.
- Tightened money handling to six-decimal USDC base units.
- Added a roadmap that keeps the remaining privacy and CRE gaps explicit.

## Best Merge Direction

The ideal submission is Claude's on-chain/privacy core plus GPT's faster product surface:

- Keep Claude's durable PrivacyPool/Unlink service, CRE attester, and Foundry tests.
- Add GPT-style simulator fallback, compact unified audit/feed UX, and one-command no-credentials demo.
- Make every UI action show whether it is simulator-backed or contract-backed.
