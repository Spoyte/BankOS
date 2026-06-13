# Charter 🏦

**Charter your own private, compliant, self-custodial stablecoin bank on Arc — in minutes.**

Charter is a *bank factory*: infrastructure that lets any operator ("steward") launch a branded,
rule-based stablecoin bank with **private balances** (Unlink), **programmable compliance** (Chainlink
CRE), and **seamless onboarding** (Dynamic), settled in USDC on **Arc**. Members keep their own keys;
the steward configures policy, never custody.

> Not an FDIC-insured deposit bank. Charter is *banking infrastructure* / self-custodial bank rails.

---

## Why

Community banking is dying while the need grows. The primitives to rebuild it now exist:

| Layer | Sponsor | Role in Charter |
|---|---|---|
| **Private balance & execution** | **Unlink** | Members' checking balances and transfers live off the public ledger; treasury moves are shielded. |
| **Compliance / policy** | **Chainlink CRE** | Confidential KYC / sanctions / eligibility run in a TEE; only the *decision* (a `Policy`) is attested on-chain. |
| **Onboarding UX** | **Dynamic** | Passkey embedded wallets — members join a bank without installing MetaMask. |
| **Settlement** | **Arc** | USDC-native L1; balances, fees, and credit are all denominated in dollars. |
| **Treasury routing** *(stretch)* | **LI.FI** | Optional same-chain swap calldata for idle-reserve allocation (feature-flagged — see [ADR-001](docs/ADR-001-lifi-poc.md)). |

The thesis: **social trust on top, cryptographic guard-rails underneath.**

---

## Architecture

```
                ┌─────────────────────────────────────────────────────────────┐
                │                       Web app (Dynamic)                        │
                │   Operator console  ·  Member app  ·  Steward treasury desk    │
                └───────────┬───────────────────────┬───────────────────────────┘
                            │                        │
              viem / wagmi  │                        │  @unlink-xyz/sdk
                            ▼                        ▼
   ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
   │            Arc (EVM L1)           │   │     Unlink engine (private)        │
   │  CharterFactory → Bank (clones)   │   │  deposit · transfer · withdraw     │
   │  PolicyRegistry · ExecutionRouter │   │  burner (private DeFi / yield)     │
   │  MockUSDC · MockYieldVault        │   │  → shielded balances & notes       │
   └───────────────▲──────────────────┘   └──────────────────────────────────┘
                   │ attest() (state change)
   ┌───────────────┴──────────────────┐
   │   Chainlink CRE policy workflow   │  Confidential HTTP KYC/sanctions in a TEE,
   │   + DON forwarder (attester)      │  lands a Policy on PolicyRegistry.
   └──────────────────────────────────┘
```

**Five core contracts** (`packages/contracts`):

- `CharterFactory` — charters new banks as minimal-proxy clones; registry of all banks.
- `Bank` — per-bank: deposits, withdrawals (delay), policy-gated credit, treasury routing, risk caps,
  pause, and the member→Unlink-account pointer for private checking.
- `PolicyRegistry` — Chainlink-attested compliance outputs (`canDeposit`, `canBorrow`, tier,
  jurisdiction, expiry). Only the DON forwarder can write.
- `ExecutionRouter` — allow-list of `(target, selector)` pairs a steward may call for yield/treasury.
- `RiskConfig` (in `CharterTypes`) — utilization caps, withdrawal delay, per-borrower limits.

## Repo layout

```
packages/
  contracts/      Foundry — the five contracts, mocks, 28-test suite, deploy script
  shared/         chain config (Arc), ABIs, shared types (TS)
  cre-policy/     Chainlink CRE compliance workflow + local DON simulator (attester)
  unlink-engine/  Unlink integration + local engine emulator (runs offline)
  web/            Vite + React app — Dynamic onboarding, operator + member + steward UIs
scripts/
  lifi-poc.mjs    LI.FI feasibility PoC (see ADR-001)
  export-abis.mjs ABIs → shared
  demo.sh         one-command end-to-end local demo
```

## Quick start

```bash
npm install
npm run chain            # terminal 1: local Arc (anvil)
npm run deploy:local     # deploy the stack, writes deployments/31337.json
npm run abis             # export ABIs to shared
npm run engine:dev       # terminal 2: local Unlink engine emulator
npm run policy:dev       # terminal 3: Chainlink CRE policy service + attester
npm run web:dev          # terminal 4: the app
```

Or the scripted demo: `npm run demo`.

## Status

- ✅ Contracts: 5 contracts + mocks, **28/28 tests pass**, deploys to local Arc.
- ✅ LI.FI PoC complete → ship as feature-flagged stretch (ADR-001).
- 🚧 CRE policy service, Unlink engine + integration, web app (in progress).

See [`docs/ADR-001-lifi-poc.md`](docs/ADR-001-lifi-poc.md) for the LI.FI decision.
