#!/usr/bin/env bash
# Charter — one-command local demo. Boots a local Arc (anvil), deploys the stack, starts the
# Chainlink CRE policy service + Unlink engine, seeds a demo bank, and launches the web app.
#
#   bash scripts/demo.sh          # start everything (always from a clean slate)
#   bash scripts/demo.sh stop     # stop the background services
#
# Reproducibility: the start path ALWAYS stops prior Charter services and the demo anvil first, then
# redeploys, so services can never serve a stale deployment. After each service starts we verify its
# /info/environment matches the freshly written deployments/31337.json before proceeding.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG=/tmp/charter
mkdir -p "$LOG"
PIDS="$ROOT/.demo-pids"
RPC=http://127.0.0.1:8545
DEP="$ROOT/packages/contracts/deployments/31337.json"

# Kill whatever is listening on a TCP port (portable across lsof/fuser).
kill_port() {
  local port="$1" pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "$port/tcp" 2>/dev/null || true)
  fi
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
}

wait_for() { # url, name
  for _ in $(seq 1 40); do curl -s -m 2 "$1" >/dev/null 2>&1 && return 0; sleep 0.5; done
  echo "!! $2 did not come up (see $LOG)"; return 1
}

# Assert a service's /info/environment reports the same contract address as the current deployment.
assert_env() { # url, jsonKey
  local got want
  got=$(curl -s -m 4 "$1" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d)['$2']||''))}catch{process.stdout.write('')}})")
  want=$(node -e "process.stdout.write(String(require('$DEP')['$2']||''))")
  if [ -z "$got" ] || [ "${got,,}" != "${want,,}" ]; then
    echo "!! service at $1 reports $2=$got but deployment has $want — stale service."
    return 1
  fi
}

stop() {
  echo "Stopping Charter demo services…"
  [ -f "$PIDS" ] && while read -r p; do kill "$p" 2>/dev/null || true; done < "$PIDS"
  rm -f "$PIDS"
  kill_port 4001; kill_port 4002
  pkill -f "anvil --chain-id 31337" 2>/dev/null || true
  echo "done."
}

[ "${1:-}" = "stop" ] && { stop; exit 0; }

# ---- clean slate so we never serve a stale deployment ----
echo "▸ 0/7 stop any prior Charter services (clean slate)…"
[ -f "$PIDS" ] && while read -r p; do kill "$p" 2>/dev/null || true; done < "$PIDS"
kill_port 4001; kill_port 4002
pkill -f "anvil --chain-id 31337" 2>/dev/null || true
sleep 1
: > "$PIDS"

echo "▸ 1/7 anvil (local Arc)…"
nohup anvil --chain-id 31337 --host 127.0.0.1 --port 8545 >"$LOG/anvil.log" 2>&1 &
echo $! >> "$PIDS"
wait_for "$RPC" "anvil" || { echo "anvil failed"; exit 1; }

echo "▸ 2/7 deploy contracts…"
( cd packages/contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast ) >"$LOG/deploy.log" 2>&1
grep -E "CharterFactory|PrivacyPool" "$LOG/deploy.log" || { echo "deploy failed (see $LOG/deploy.log)"; exit 1; }

echo "▸ 3/7 export ABIs + sync web…"
node scripts/export-abis.mjs >/dev/null
node scripts/sync-web.mjs >/dev/null

echo "▸ 4/7 Chainlink CRE policy service (:4001)…"
nohup npm run -s -w @bankos/cre-policy start >"$LOG/policy.log" 2>&1 &
echo $! >> "$PIDS"
wait_for http://127.0.0.1:4001/health "policy service" || exit 1
assert_env http://127.0.0.1:4001/health policyRegistry || { echo "→ run: bash scripts/demo.sh stop, then retry"; exit 1; }

echo "▸ 5/7 Unlink engine (:4002)…"
nohup npm run -s -w @bankos/unlink-engine start >"$LOG/engine.log" 2>&1 &
echo $! >> "$PIDS"
wait_for http://127.0.0.1:4002/info/environment "unlink engine" || exit 1
assert_env http://127.0.0.1:4002/info/environment privacyPool || { echo "→ run: bash scripts/demo.sh stop, then retry"; exit 1; }

echo "▸ 6/7 seed demo bank…"
if npm run -s -w @bankos/cre-policy seed >"$LOG/seed.log" 2>&1; then
  grep -E "bank =|totalAssets|utilization" "$LOG/seed.log" || true
else
  echo "!! seed failed (see $LOG/seed.log) — continuing, but demo state is incomplete."
fi

echo "▸ 7/7 web app…"
nohup npm run -s -w @bankos/web dev >"$LOG/web.log" 2>&1 &
echo $! >> "$PIDS"
WEB_URL=""
for _ in $(seq 1 30); do
  WEB_URL=$(grep -oE "http://127.0.0.1:[0-9]+/?" "$LOG/web.log" | head -1)
  if [ -n "$WEB_URL" ] && curl -s -m 2 -o /dev/null "$WEB_URL"; then break; fi
  sleep 0.5
done
[ -z "$WEB_URL" ] && WEB_URL="(see $LOG/web.log)"

cat <<EOF

──────────────────────────────────────────────────────────────
  Charter demo is up (fresh deployment, services verified).

  Web app:        ${WEB_URL}
  Policy (CRE):   http://127.0.0.1:4001/health
  Unlink engine:  http://127.0.0.1:4002/info/environment
  Local Arc RPC:  $RPC  (chainId 31337)

  Try it:
    • Open the web app, pick a persona (top-right).
    • As "Steward" → Operator tab → charter a bank.
    • As "Dave (new member)" → open the bank → onboard (KYC) → deposit.
    • Use the 🔒 Private balance card to shield, send a private transfer, and withdraw.

  Privacy CLI demo:  npm run -w @bankos/unlink-engine demo
  Stop everything:   bash scripts/demo.sh stop
──────────────────────────────────────────────────────────────
EOF
