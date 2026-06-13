# @charter/unlink-engine

The privacy layer. Members hold **private checking balances** and move money **privately** using the
real `@unlink-xyz/sdk` account model, settled against an on-chain `PrivacyPool`.

## What is genuinely Unlink

- Real `unlink1…` accounts derived with `@unlink-xyz/sdk` (`deriveAccountKeys` / `encodeAddress`).
- Real **EdDSA (BN254)** signatures authorizing every transfer/withdrawal, verified by the engine.
- Real **poseidon** note commitments for shielded deposits.

Only the *ledger/relayer* is emulated locally so the demo runs without a hosted engine. Flip to the
hosted Unlink engine with `LiveUnlinkClient` (`UNLINK_ENGINE_URL` + `UNLINK_API_KEY`) — same accounts,
same addresses.

## The flow (and what stays private)

```
 shield (deposit)         private transfer            withdraw (exit)
 ───────────────►          ───────────────►           ───────────────►
 USDC ──▶ PrivacyPool      alice ⇒ bob                 PrivacyPool ──▶ fresh EVM addr
 [ON CHAIN: depositor,     [OFF CHAIN: never           [ON CHAIN: recipient + amount,
  amount, commitment]       hits the chain — hidden]    unlinked from the depositor]
```

An on-chain observer sees deposits and withdrawals but **cannot** see internal transfers, per-user
balances, or the link between a depositor and a later withdrawal.

## Components

- `src/account.ts` — Unlink account + EdDSA/poseidon message helpers (real SDK crypto).
- `src/ledger.ts` — in-memory shielded ledger; verifies EdDSA spends, tracks nonces + nullifiers.
- `src/server.ts` — the engine: HTTP API + viem relayer that settles `PrivacyPool.withdraw`.
- `src/client.ts` — `UnlinkClient` interface + `LocalUnlinkClient` (used by the app + CLI).
- `src/live.ts` — `LiveUnlinkClient`, the real hosted-engine path via `createUnlink()`.
- `src/demo.ts` — CLI proving shield → private transfer → withdraw.

## Run

```bash
npm run -w @charter/unlink-engine dev    # engine on :4002
npm run -w @charter/unlink-engine demo   # the privacy demo (needs anvil + deploy + engine)
```
