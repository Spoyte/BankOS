# Recorded demo output

Captured from a clean run (`bash scripts/demo.sh` → fresh deploy + verified services), 2026-06-13.

## Privacy CLI — shield → private transfer → withdraw

`npm run -w @charter/unlink-engine demo`

```
== Unlink privacy demo (shield → private transfer → withdraw) ==

alice unlink: unlink1qq4cmf89psuzvmnvdn8…
bob   unlink: unlink1qqscwtg259exahwd445…

1) alice shields 1000 USDC into the privacy pool (on-chain deposit)…
   tx 0x01f209eff767…  commitment 0x1435a5872cdb…
   alice shielded balance: 1000 USDC

2) alice privately transfers 600 USDC to bob (OFF-CHAIN — no tx, hidden)…
   alice: 400 USDC   bob: 600 USDC

3) bob withdraws 600 USDC to a FRESH address 0x14dC7996… (on-chain settle)…
   tx 0xea23ae928d8f…  fresh address received 600 USDC
   bob shielded balance: 0 USDC

== What an on-chain observer sees ==
  Deposited events: …  (depositor + amount, but not who owns it after)
  Withdrawn events: …  (recipient + amount, unlinked from the depositor)
  The alice→bob transfer of 600 USDC: NOT on chain. Balances + history stay private.

Unlink privacy demo complete ✅
```

(`Deposited`/`Withdrawn` counts are cumulative on the persistent pool; per-run balances reconcile exactly.)

## Seed pipeline (`npm run seed`)

```
bank = 0x…
totalDeposits:   150000 USDC
totalDebt:       12000 USDC
idleLiquidity:   78000 USDC
inStrategies:    63000 USDC
totalAssets:     141000 USDC
utilization:     8%
```

## Notes on reproducibility (hardened after external review)

- `scripts/demo.sh` now **always starts from a clean slate**: it stops prior Charter services + the demo
  anvil, redeploys, and then asserts each service's `/info/environment` matches the freshly written
  `deployments/31337.json` before continuing. This prevents a stale engine/policy from serving an old
  deployment and silently passing health checks.
- Withdrawal nullifiers are now globally unique (random salt), so the privacy demo no longer reverts with
  `NullifierUsed()` when the engine is restarted against a still-deployed `PrivacyPool` (the pool's
  nullifier set is persistent; the engine's in-memory nonce is not).
