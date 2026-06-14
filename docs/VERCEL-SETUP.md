# Hosting BankOS — what you need to do

The repo is on your GitHub. This walks through getting the **frontend live on Vercel** and the **two
backends** running, pointed at Arc testnet. Steps marked **🧑 you** need your account/login; everything
else I've already wired (`vercel.json`, build scripts, env-driven config).

---

## 1. Frontend on Vercel (🧑 you — ~3 min)

1. Go to **vercel.com → Add New → Project**, and import the GitHub repo you just received.
2. Vercel auto-detects `vercel.json` at the repo root — leave **Root Directory** as the repo root.
   (Build/install/output are already set: it runs `sync-web` + `vite build`, outputs `packages/web/dist`,
   and SPA-rewrites all routes.)
3. Add these **Environment Variables** (Project → Settings → Environment Variables), then deploy:

   | Variable | Value | Needed? |
   |---|---|---|
   | `VITE_CHAIN_ID` | `5042002` | yes (targets Arc testnet) |
   | `VITE_RPC_URL` | `https://rpc.testnet.arc.network` | optional (has a fallback) |
   | `VITE_POLICY_URL` | `https://bankos-cre-policy.fly.dev` | for KYC onboarding (live on Fly ✅) |
   | `VITE_ENGINE_URL` | `https://bankos-unlink-engine.fly.dev` | for private balances (live on Fly ✅) |
   | `VITE_DYNAMIC_ENVIRONMENT_ID` | from the Dynamic dashboard (step 3) | for passkey onboarding |
   | `VITE_ENABLE_LIFI` | `true` | optional (treasury route preview) |

   > Without `VITE_POLICY_URL`/`VITE_ENGINE_URL`, the site still loads and chain reads/writes work, but
   > the compliance + private-balance flows can't reach their backends. Without
   > `VITE_DYNAMIC_ENVIRONMENT_ID`, the app uses local demo personas (no passkey login).

That's it for the static site — every push to the repo auto-deploys.

---

## 2. Backends — deployed to Fly.io ✅ (me)

The two Express apps — **`@bankos/cre-policy`** (Chainlink-CRE attester) and **`@bankos/unlink-engine`**
(Unlink privacy relayer) — are **already deployed on Fly.io**, always-on, pointed at Arc:

| Service | URL | Fly app |
|---|---|---|
| CRE policy | `https://bankos-cre-policy.fly.dev` | `bankos-cre-policy` |
| Unlink engine | `https://bankos-unlink-engine.fly.dev` | `bankos-unlink-engine` |

They hold in-memory state (the Unlink shielded ledger), so each runs as a **single always-on machine**
(`--ha=false`, `auto_stop_machines = "off"`) — never scale them past 1. Config lives in
[`fly.cre-policy.toml`](../fly.cre-policy.toml) / [`fly.unlink-engine.toml`](../fly.unlink-engine.toml)
and the shared [`Dockerfile`](../Dockerfile). Non-secret env (`CHAIN_ID`, `RPC_URL`, `PORT=8080`) is in
the toml; the Arc signer key is a **Fly secret** (`ATTESTER_PRIVATE_KEY` / `ENGINE_PRIVATE_KEY`), set from
gitignored `.secrets/arc-deployer.env` — never committed.

```bash
# redeploy after a change (run from repo root)
~/.fly/bin/flyctl deploy -c fly.cre-policy.toml    --remote-only --ha=false
~/.fly/bin/flyctl deploy -c fly.unlink-engine.toml --remote-only --ha=false
# health checks
curl https://bankos-cre-policy.fly.dev/health
curl https://bankos-unlink-engine.fly.dev/health
```

Optional: set `ANTHROPIC_API_KEY` on the policy app to enable the Claude-backed treasury agent —
`flyctl secrets set ANTHROPIC_API_KEY=… -a bankos-cre-policy`.

---

## 3. Dynamic embedded wallets (🧑 you — optional, ~5 min)

1. **app.dynamic.xyz** → create a project → copy the **Environment ID** → set `VITE_DYNAMIC_ENVIRONMENT_ID`.
2. In the Dynamic dashboard, add **Arc Testnet** as an EVM network (chainId `5042002`, RPC
   `https://rpc.testnet.arc.network`). Members then onboard with a passkey and get an Arc embedded wallet.

---

## 4. Arc deploy ✅ (done)

Contracts are **live on Arc testnet** (chainId `5042002`); addresses are committed in
[`packages/contracts/deployments/5042002.json`](../packages/contracts/deployments/5042002.json), so the
Vercel build picks them up automatically. Deployer `0xC87BFb1081b328E39D6836EAE1488dEb444DFDD4` (also the
CRE attester + Unlink relayer). Re-deploy with `bash scripts/deploy-arc.sh`.

---

## Summary — your action items

Almost everything is done. **Your one remaining step:**

- [ ] **Import `Spoyte/BankOS` into Vercel** + set the env vars from step 1 (most importantly
      `VITE_CHAIN_ID=5042002`, `VITE_POLICY_URL`, `VITE_ENGINE_URL` — the Fly URLs are already filled in).
- [ ] *(optional)* Create a **Dynamic** project + add Arc network (step 3) for real passkey onboarding.

Done for you: ✅ Arc contracts deployed · ✅ addresses committed · ✅ both backends live on Fly.io ·
✅ repo on GitHub (`Spoyte/BankOS`).
