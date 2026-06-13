# Hosting Charter — what you need to do

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
   | `VITE_POLICY_URL` | your hosted policy URL (step 2) | for KYC onboarding |
   | `VITE_ENGINE_URL` | your hosted engine URL (step 2) | for private balances |
   | `VITE_DYNAMIC_ENVIRONMENT_ID` | from the Dynamic dashboard (step 3) | for passkey onboarding |
   | `VITE_ENABLE_LIFI` | `true` | optional (treasury route preview) |

   > Without `VITE_POLICY_URL`/`VITE_ENGINE_URL`, the site still loads and chain reads/writes work, but
   > the compliance + private-balance flows can't reach their backends. Without
   > `VITE_DYNAMIC_ENVIRONMENT_ID`, the app uses local demo personas (no passkey login).

That's it for the static site — every push to the repo auto-deploys.

---

## 2. Backends — CRE policy service + Unlink engine

Two small Express apps need to run somewhere with the **Arc deployer key** (they sign Arc txs as the
attester / relayer). They hold in-memory state (the Unlink shielded ledger), so they need a **stateful
host** — Railway, Render, Fly.io, or any small VM. They are *not* a good fit for serverless.

**`@charter/cre-policy`** (the Chainlink-CRE attester, default port 4001) and **`@charter/unlink-engine`**
(the privacy relayer, default port 4002). For each, set:

```
CHAIN_ID=5042002
RPC_URL=https://rpc.testnet.arc.network
DEPLOYMENT_PATH=/app/packages/contracts/deployments/5042002.json   # committed after Arc deploy
ATTESTER_PRIVATE_KEY=<the Arc deployer key>     # cre-policy only
ENGINE_PRIVATE_KEY=<the Arc deployer key>       # unlink-engine only
PORT=<host-assigned>                             # cre-policy reads POLICY_PORT / unlink reads ENGINE_PORT
ANTHROPIC_API_KEY=<optional>                      # enables the Claude-backed treasury agent
```

Start commands: `npm run -w @charter/cre-policy start` and `npm run -w @charter/unlink-engine start`.
The Arc deployer key is in `.secrets/arc-deployer.env` (gitignored) — paste it into the host's secret
manager, don't commit it. Put the two resulting URLs into `VITE_POLICY_URL` / `VITE_ENGINE_URL` above.

> **Tell me your host of choice** (Railway/Render/Fly) and I'll add the config (a `Procfile`/`render.yaml`
> /`fly.toml`) and a one-command deploy. If you'd rather demo the hosted frontend against a *local*
> backend, run `bash scripts/demo.sh` and tunnel `:4001`/`:4002` (e.g. `cloudflared`/`ngrok`), then point
> the two `VITE_*_URL` envs at the tunnels.

---

## 3. Dynamic embedded wallets (🧑 you — optional, ~5 min)

1. **app.dynamic.xyz** → create a project → copy the **Environment ID** → set `VITE_DYNAMIC_ENVIRONMENT_ID`.
2. In the Dynamic dashboard, add **Arc Testnet** as an EVM network (chainId `5042002`, RPC
   `https://rpc.testnet.arc.network`). Members then onboard with a passkey and get an Arc embedded wallet.

---

## 4. Arc deploy (me, once you fund the key)

See [`ARC-DEPLOY.md`](./ARC-DEPLOY.md) — fund `0xC87BFb1081b328E39D6836EAE1488dEb444DFDD4` with ~10
Arc-testnet USDC and I run `bash scripts/deploy-arc.sh`, commit `deployments/5042002.json`, and the Vercel
build picks up the real addresses on the next push.

---

## Summary — your action items

- [ ] **Fund** `0xC87BFb1081b328E39D6836EAE1488dEb444DFDD4` with Arc-testnet USDC → tell me "funded".
- [ ] **Import** the GitHub repo into Vercel + set the env vars (step 1).
- [ ] **Pick a host** for the two backends (step 2) — or tell me to use tunnels for the demo.
- [ ] *(optional)* Create a **Dynamic** project + add Arc network (step 3).

Everything else (Arc contract deploy, committing addresses, backend configs for your chosen host) I'll
handle.
