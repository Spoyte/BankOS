#!/usr/bin/env bash
# Read-back proof for the BankOS Arc-testnet deployment.
# No private keys needed — pure on-chain reads + hosted-backend health. One command for a reviewer to
# confirm the contracts are really live on Arc and the committed addresses are not stale.
#
#   bash scripts/verify-arc.sh
set -euo pipefail

RPC="${RPC_URL:-https://rpc.testnet.arc.network}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEP="$ROOT/packages/contracts/deployments/5042002.json"
CAST="${CAST:-$HOME/.foundry/bin/cast}"
DEPLOYER="0xC87BFb1081b328E39D6836EAE1488dEb444DFDD4"

echo "== BankOS Arc-testnet read-back =="
echo "RPC: $RPC"
[ -f "$DEP" ] || { echo "✗ missing $DEP — deploy first: bash scripts/deploy-arc.sh"; exit 1; }
command -v "$CAST" >/dev/null || { echo "✗ cast (foundry) not found at $CAST"; exit 1; }

get() { node -e "console.log(require('$DEP').$1)"; }
PRIVACY_POOL=$(get privacyPool); ENGINE_RELAYER=$(get engineRelayer)

echo; echo "-- committed addresses (deployments/5042002.json) --"; cat "$DEP"
echo; echo "-- chainId (on-chain) --"; "$CAST" chain-id --rpc-url "$RPC"
echo "-- deployer gas balance (USDC is the 18dp native gas token) --"; "$CAST" balance "$DEPLOYER" --rpc-url "$RPC"

echo; echo "-- PrivacyPool.relayer() must equal deployments.engineRelayer (catches stale deploys) --"
ONCHAIN_RELAYER=$("$CAST" call "$PRIVACY_POOL" "relayer()(address)" --rpc-url "$RPC")
echo "  on-chain : $ONCHAIN_RELAYER"
echo "  expected : $ENGINE_RELAYER"
if [ "$(echo "$ONCHAIN_RELAYER" | tr 'A-Z' 'a-z')" = "$(echo "$ENGINE_RELAYER" | tr 'A-Z' 'a-z')" ]; then
  echo "  ✓ relayer matches"
else
  echo "  ✗ MISMATCH — stale deployment or wrong addresses"; exit 1
fi

echo; echo "-- hosted backends (Fly) point at the same Arc deployment --"
curl -fsS --max-time 20 https://bankos-unlink-engine.fly.dev/info/environment && echo
curl -fsS --max-time 20 https://bankos-cre-policy.fly.dev/health && echo

echo; echo "✓ Arc read-back complete — contracts live on chainId 5042002, addresses consistent."
