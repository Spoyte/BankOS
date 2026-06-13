# @charter/cre-policy

The compliance layer: a Chainlink CRE workflow plus a local DON simulator that share one decision
brain (`src/compliance.ts`).

- **`workflow/`** — the production **Chainlink CRE** workflow. HTTP-triggered, screens KYC via
  **Confidential HTTP** inside the enclave, and lands a `Policy` on-chain via
  `PolicyRegistry.onReport`. Run with the CRE CLI (`cre workflow simulate`). See `workflow/README.md`.
- **`src/`** — the local **DON simulator + attester** that runs the *same* compliance logic and
  submits `PolicyRegistry.attest()` with the authorized attester key, so the demo produces a real
  on-chain state change without the live DON.

## Endpoints (local service, port 4001)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | service + attester + registry info |
| `POST` | `/apply` | `{bank, member, kyc}` → confidential screen → on-chain attest → `{approved, policy, txHash}` |
| `GET` | `/policy/:bank/:member` | read the attested policy |
| `POST` | `/revoke` | `{bank, member}` → revoke attestation |

Raw KYC/PII never leaves the process and is never written on-chain — only the `Policy` (tier,
eligibility booleans, coarse jurisdiction tag, expiry).

## Run

```bash
npm run -w @charter/cre-policy dev    # local DON simulator on :4001
npm run -w @charter/cre-policy seed   # charter a demo bank + onboard members + deposit + credit + yield
```
