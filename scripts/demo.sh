#!/usr/bin/env bash
# Charter — one-command local demo. Boots a local Arc (anvil), deploys the stack, starts the
# Chainlink CRE policy service + Unlink engine, seeds a demo bank, and launches the web app.
#
#   bash scripts/demo.sh          # start everything
#   bash scripts/demo.sh stop     # stop the background services
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG=/tmp/charter
mkdir -p "$LOG"
PIDS="$ROOT/.demo-pids"
RPC=http://127.0.0.1:8545

wait_for() { # url, name
  for _ in $(seq 1 30); do curl -s -m 2 "$1" >/dev/null 2>&1 && return 0; sleep 0.5; done
  echo "!! $2 did not come up (see $LOG)"; return 1
}

stop() {
  echo "Stopping Charter demo services…"
  [ -f "$PIDS" ] && while read -r p; do kill "$p" 2>/dev/null || true; done < "$PIDS"
  rm -f "$PIDS"
  pkill -f "anvil --chain-id 31337" 2>/dev/null || true
  pkill -f "tsx.*cre-policy" 2>/dev/null || true
  pkill -f "tsx.*unlink-engine" 2>/dev/null || true
  echo "done."
}

[ "${1:-}" = "stop" ] && { stop; exit 0; }

: > "$PIDS"

echo "▸ 1/7 anvil (local Arc)…"
if ! curl -s -m 2 -X POST "$RPC" -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' >/dev/null 2>&1; then
  nohup anvil --chain-id 31337 --host 127.0.0.1 --port 8545 >"$LOG/anvil.log" 2>&1 &
  echo $! >> "$PIDS"
  sleep 2
fi

echo "▸ 2/7 deploy contracts…"
( cd packages/contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast ) >"$LOG/deploy.log" 2>&1
grep -E "CharterFactory|PrivacyPool" "$LOG/deploy.log" || true

echo "▸ 3/7 export ABIs + sync web…"
node scripts/export-abis.mjs >/dev/null
node scripts/sync-web.mjs >/dev/null

echo "▸ 4/7 Chainlink CRE policy service (:4001)…"
nohup npm run -s -w @charter/cre-policy start >"$LOG/policy.log" 2>&1 &
echo $! >> "$PIDS"
wait_for http://127.0.0.1:4001/health "policy service"

echo "▸ 5/7 Unlink engine (:4002)…"
nohup npm run -s -w @charter/unlink-engine start >"$LOG/engine.log" 2>&1 &
echo $! >> "$PIDS"
wait_for http://127.0.0.1:4002/health "unlink engine"

echo "▸ 6/7 seed demo bank…"
npm run -s -w @charter/cre-policy seed >"$LOG/seed.log" 2>&1 || true
grep -E "bank =|totalAssets|utilization" "$LOG/seed.log" || true

echo "▸ 7/7 web app…"
nohup npm run -s -w @charter/web dev >"$LOG/web.log" 2>&1 &
echo $! >> "$PIDS"
sleep 3
WEB_URL=$(grep -oE "http://127.0.0.1:[0-9]+/?" "$LOG/web.log" | head -1)

cat <<EOF

──────────────────────────────────────────────────────────────
  Charter demo is up.

  Web app:        ${WEB_URL:-http://127.0.0.1:5173/}
  Policy (CRE):   http://127.0.0.1:4001/health
  Unlink engine:  http://127.0.0.1:4002/health
  Local Arc RPC:  $RPC  (chainId 31337)

  Try it:
    • Open the web app, pick a persona (top-right).
    • As "Steward" → Operator tab → charter a bank.
    • As "Dave (new member)" → open the bank → onboard (KYC) → deposit.
    • Use the 🔒 Private balance card to shield, send a private transfer, and withdraw.

  Privacy CLI demo:  npm run -w @charter/unlink-engine demo
  Stop everything:   bash scripts/demo.sh stop
──────────────────────────────────────────────────────────────
EOF
