# Chainlink CRE — proof of use (BankOS)

BankOS uses **Chainlink CRE** for confidential compliance: a member's KYC is screened off-chain (in the
CRE enclave in production), and only the *decision* — a `Policy` (tier, deposit/borrow eligibility, a
coarse jurisdiction tag, expiry) — is written on-chain to `PolicyRegistry`. Every BankOS bank reads that
Policy to gate deposits and credit, so the Chainlink-driven state change is **meaningfully used**, not
just read in a frontend. Raw PII never touches the chain.

## Proof 1 — the CRE decision makes a real on-chain state change on **Arc** (verified live)

The compliance decision lands on-chain via `PolicyRegistry.attest` / `onReport` on Arc testnet
(chainId 5042002). Captured live from the hosted policy service:

```
POST https://bankos-cre-policy.fly.dev/apply
  { bank, member, kyc:{ country:"US", region:"NY", governmentIdHash, sanctionsConsent:true, requestsCredit:true } }
→ { approved:true, policy:{ tier:3, canDeposit:true, canBorrow:true, jurisdiction:0xde54…, expiry },
    txHash: 0xe3ce716c78db5fcff13f382115fca2ed0d8f8e145698fde09ce9d3f7d3c26a5c }
```

On-chain facts (Arc testnet):
- **tx** `0xe3ce716c78db5fcff13f382115fca2ed0d8f8e145698fde09ce9d3f7d3c26a5c` — block **47033115**,
  `from` `0xC87BFb1081b328E39D6836EAE1488dEb444DFDD4` (the authorized attester) → `to`
  `0xB2ab070Bc1aB3c2be8B1D3ABb122Fd55a489dAa5` (`PolicyRegistry`).
- **Read-back** confirms the stored Policy:
  ```bash
  cast call 0xB2ab070Bc1aB3c2be8B1D3ABb122Fd55a489dAa5 \
    "getPolicy(address,address)((uint8,bool,bool,bytes32,uint64))" <bank> <member> \
    --rpc-url https://rpc.testnet.arc.network
  # → (3, true, true, 0xde54c2d71c467b8de53838259e0eee9888fc7ebc81766cc38b78a67b2ea10c57, 1812977280)
  ```

Reproduce: `bash scripts/verify-arc.sh` (read-back), or POST the `/apply` above.

## Proof 2 — the real CRE workflow runs in the real `cre` simulator

`packages/cre-policy/workflow/` is a real Chainlink CRE workflow (CRE SDK `@chainlink/cre-sdk`) that
**compiles to WASM and runs under `cre workflow simulate`** (not a hand-rolled mock):

```bash
cd packages/cre-policy && cre workflow simulate ./workflow \
  --target staging-settings --allow-unknown-chains \
  --http-payload ./workflow/examples/kyc-approve.json
# ✓ Workflow compiled → http-trigger@1.0.0-alpha fires → Decision approved=true tier=3
#   → Report (abi.encode bank,member,Policy) → result "screened …: tier 3, approved=true"
```

- HTTP-triggered (a member submits KYC), confidential screening, then it produces
  `abi.encode(bank, member, Policy)` and (when `evmWrite` is on) delivers it to
  `PolicyRegistry.onReport(metadata, report)` via the EVM capability.
- The screening logic is imported **verbatim** from the local DON simulator (`../src/compliance.ts`), so
  the simulated/deployed workflow and the on-chain attestation in Proof 1 make **identical** decisions.
- Unit tests: `packages/cre-policy/workflow/main.test.ts` (`bun test`, 4 cases).

## Honest scope

- The on-chain attestation in Proof 1 is signed by the **authorized attester** (the cre-policy service =
  the CRE **local DON simulator**, sharing the workflow's exact decision logic). The CRE **workflow**
  itself runs in the real `cre` simulator (Proof 2).
- **Not yet deployed to a live Chainlink DON.** Live-DON delivery (forwarder → `onReport`) is the
  remaining go-live step.

## Go-live on a real DON (what's needed)

1. `cre account access` — request workflow **deploy access** from Chainlink (approval-gated).
2. Authorize the DON's **KeystoneForwarder** on the registry: `PolicyRegistry.setAttester(forwarder, true)`.
3. Set `evmWrite: true` (`workflow/config.production.json`) and `cre workflow deploy`.
4. **LINK:** needed to fund the workflow on the live DON (testnet LINK). *Not* needed for the simulator
   (Proof 2) or the current on-chain attestation (Proof 1 pays Arc gas in USDC, already funded).

So the only external dependency for live-DON is Chainlink **deploy-access approval** (+ testnet LINK to
fund the workflow). Everything else is in place: the workflow compiles + simulates, the receiver
(`PolicyRegistry.onReport`) is deployed on Arc, and the attestation path is proven on-chain.
