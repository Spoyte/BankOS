# BankOS compliance workflow (Chainlink CRE)

The **production** compliance path — a real, runnable CRE workflow for the `cre` CLI (v1.x). It:

1. is **HTTP-triggered** — a member submits a KYC application,
2. **screens it confidentially** (sanctions / jurisdiction / age / ID). The screening logic is imported
   verbatim from the local DON simulator (`../src/compliance.ts`), so the simulated/deployed workflow
   and the local demo always make **identical** decisions. In production the raw PII is screened inside
   the CRE enclave (Confidential HTTP); only the decision leaves.
3. produces a DON **report** = `abi.encode(bank, member, Policy)` and (when `evmWrite` is on) delivers it
   to `PolicyRegistry.onReport(metadata, report)` via the EVM capability — the on-chain state change that
   gates every BankOS bank.

Layout (the `cre` compiler needs the WASM entry to export only the parameterless `main`):

| File | Role |
|---|---|
| `main.ts` | thin WASM entry — builds the `Runner`, runs `initWorkflow`, calls `main()` |
| `workflow.ts` | all logic: `configSchema`, `onApplication`, `encodeReport`, `initWorkflow` (what the test imports) |
| `main.test.ts` | `bun test` unit tests (screening + report encoding) |
| `config.staging.json` / `config.production.json` | `evmWrite` off for offline simulation, on for a live DON deploy |
| `../project.yaml` | CRE project settings — registers Arc as an **experimental** chain (selector `5042002`) |

## Run it

```bash
cd packages/cre-policy/workflow && bun install        # CRE compile uses Bun + Javy (kept out of root install)
bun test                                              # unit-test the screening + report encoding

# Simulate the real workflow (compiles to WASM, fires the HTTP trigger) from the project root:
cd ..                                                 # packages/cre-policy (where project.yaml lives)
cre workflow simulate ./workflow --target staging-settings --allow-unknown-chains \
  --http-payload ./workflow/examples/kyc-approve.json
```

Expected: the simulator logs the decision (`approved=… tier=…`) and the `abi.encode(bank,member,Policy)`
report, then prints the result. `--allow-unknown-chains` is required because Arc is experimental.

To go live, set `evmWrite: true` (config.production.json), authorize the DON's KeystoneForwarder on the
registry (`PolicyRegistry.setAttester(forwarder, true)`), and `cre workflow deploy`.

## Why this satisfies the Chainlink prize

- A CRE **Workflow** orchestrates logic across off-chain (confidential KYC screening) and on-chain
  (the EVM `writeReport`) environments — and it **runs in the real `cre` simulator**, not a hand-rolled mock.
- It makes a **state change on-chain** (`PolicyRegistry.onReport` → stored `Policy`), meaningfully used by
  every BankOS bank to gate deposits and credit — not just read in a frontend.
