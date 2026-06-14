# BankOS compliance workflow (Chainlink CRE)

This is the **production** compliance path. It is an HTTP-triggered CRE workflow that:

1. receives a member's KYC application,
2. screens it confidentially (sanctions / jurisdiction / age / ID) using **Confidential HTTP** so raw
   PII never leaves the secure enclave,
3. lands the resulting `Policy` on-chain by delivering a DON-signed report to
   `PolicyRegistry.onReport(metadata, report)` via the KeystoneForwarder.

It shares its decision logic with the local DON simulator (`../src/compliance.ts`), so the simulated /
deployed workflow and the local demo always agree.

## Run it

```bash
cd packages/cre-policy/workflow
npm install                       # pulls @chainlink/cre-sdk (kept out of the root install)
# set policyRegistry in config.json to your deployed PolicyRegistry, then:
cre workflow simulate . --target staging-settings
# the Chainlink team can deploy a successfully-simulated workflow to the live DON.
```

`project.yaml` (CRE CLI target settings) registers Arc as an experimental chain with the
PolicyRegistry forwarder. The forwarder address must be authorized as an attester on the registry
(`PolicyRegistry.setAttester(forwarder, true)`).

## Why this satisfies the Chainlink prize

- A CRE **Workflow** orchestrates logic across off-chain (Confidential HTTP compliance) and on-chain
  (the EVM `writeReport`) environments.
- It integrates a blockchain with an external system (the compliance provider).
- It makes a **state change on-chain** (`PolicyRegistry.onReport` → stored `Policy`), used by every
  BankOS bank to gate deposits and credit — i.e. meaningfully used, not just read in a frontend.
