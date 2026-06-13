# feedback-gpt

Reviewer: GPT
Date: 2026-06-13

## Summary

Claude's Charter project is stronger than GPT's original build on the sponsor-critical axis: it moves policy, banking state, privacy escrow, and treasury controls onto local EVM contracts with Foundry coverage. The architecture is a serious hackathon submission rather than a UI-first simulator.

GPT has been improved based on this review: it now has USDC base-unit math, an Anvil smoke test, local deployment manifests, contract-backed API endpoints, a Local Contract Rail panel that reads and writes real deployed contracts, a local PrivacyPool with commitment/nullifier checks, and a signed local privacy ledger with SDK-derived accounts, EdDSA transfer/withdraw authorization, and deployment-scoped JSON persistence. Claude still remains ahead on contract-test depth, durable service orchestration, and event-replayed end-to-end privacy.

## What Claude Does Better

- Real on-chain core: `CharterFactory`, `Bank`, `PolicyRegistry`, `ExecutionRouter`, and `PrivacyPool` are deployed and behavior-tested.
- Strong contract tests: the Foundry suite covers gating, caps, credit, treasury, pause, and privacy-pool behavior.
- Privacy model: the Unlink engine uses SDK accounts, EdDSA authorization, a shielded ledger, relayer settlement, event-driven recovery, and nullifier checks.
- Chainlink fit: policy decisions are represented as on-chain attestations rather than only server-local grants.
- Demo orchestration: `scripts/demo.sh` starts the chain, deploys, launches services, seeds, and runs the web app.

## Remaining Risks In Claude

- Run friction is still higher than a simulator-first demo. Five moving parts are more impressive, but they create more failure modes in front of judges.
- The web app is less immediately product-polished than GPT's compact operator/member dashboard.
- If service health checks ever miss a stale deployment, the demo could mix old addresses with new services.
- The LI.FI path is appropriately conservative, but still mostly research/preview rather than a working private treasury route.

## What GPT Adopted From Claude

- Added an executable local contract path instead of compile-only contracts.
- Added `npm run contracts:smoke` for real Anvil transactions.
- Added `npm run contracts:deploy:local` and deployment manifests.
- Added `GET /api/contracts/state` and `POST /api/contracts/*` endpoints for contract-mode reads/writes.
- Added a UI `Local Contract Rail` panel with live on-chain metrics and recent events.
- Added a local `PrivacyPool.sol` and smoke coverage for duplicate commitments, relayer-only withdrawals, and nullifier replay rejection.
- Added a signed local privacy ledger with SDK-derived accounts, EdDSA transfer/withdraw checks, nonce replay rejection, JSON persistence, and signed relayer withdrawal through PrivacyPool.
- Tightened money handling to six-decimal USDC base units.
- Added a roadmap that keeps the remaining privacy and CRE gaps explicit.

## Best Merge Direction

The ideal submission is Claude's on-chain/privacy core plus GPT's faster product surface:

- Keep Claude's durable PrivacyPool/Unlink service, CRE attester, and Foundry tests.
- Add GPT-style simulator fallback, compact unified audit/feed UX, and one-command no-credentials demo.
- Make every UI action show whether it is simulator-backed or contract-backed.
