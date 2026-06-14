# Arc Testnet deployment — what I need from you

To put BankOS on the **real Arc testnet** (chainId `5042002`, USDC-native gas), I generated a fresh
deployer account. **Please send it Arc-testnet USDC**, then I'll deploy with one command.

## 👉 Fund this address

```
0xC87BFb1081b328E39D6836EAE1488dEb444DFDD4
```

- **Network:** Arc Testnet — RPC `https://rpc.testnet.arc.network`, chainId `5042002`, gas paid in **USDC**.
- **How much:** ~**10 USDC** is plenty. Arc targets ~$0.01/tx, and this one account does deployment **and**
  ongoing operation (it's the deployer, the Chainlink-CRE attester, and the Unlink engine relayer).
- The private key lives in `.secrets/arc-deployer.env` (gitignored — never committed/pushed).

## What happens once it's funded

I run `bash scripts/deploy-arc.sh`, which:
1. Checks the balance, then deploys all contracts to Arc (`CharterFactory · Bank · PolicyRegistry ·
   ExecutionRouter · PrivacyPool · MockYieldVault`) plus a **MockUSDC faucet** so judges can get test USDC
   in the hosted demo without acquiring real USDC. (To use Arc's canonical USDC at `0x3600…0000` instead,
   set `USDC_ADDRESS=0x3600000000000000000000000000000000000000` — one env var.)
2. Writes `packages/contracts/deployments/5042002.json` and syncs it into the web app.
3. I commit the Arc addresses so Vercel can build the hosted site against Arc.

## After deploy — the two backends also run as this account

The CRE policy service (`:4001`) and Unlink engine (`:4002`) sign Arc transactions with the **same funded
key** (attester / relayer). Hosting them is covered in [`docs/VERCEL-SETUP.md`](./VERCEL-SETUP.md) →
"Backends". They draw gas (USDC) from the same address, so the 10 USDC covers them too.

> Reply once you've sent the USDC (or just say "funded") and I'll deploy + wire the hosted site to Arc.
