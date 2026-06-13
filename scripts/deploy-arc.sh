#!/usr/bin/env bash
# Deploy the Charter stack to Arc Testnet (chainId 5042002).
# Run AFTER the deployer address in .secrets/arc-deployer.env has been funded with Arc-testnet USDC
# (Arc uses USDC as the native gas token). One account serves as deployer + attester + engine relayer.
#
#   bash scripts/deploy-arc.sh
#
# Set USDC_ADDRESS=0x3600000000000000000000000000000000000000 to use Arc's canonical USDC instead of
# deploying a MockUSDC faucet (the default — chosen so the hosted demo's faucet works for judges).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .secrets/arc-deployer.env ] || { echo "missing .secrets/arc-deployer.env"; exit 1; }
set -a; source .secrets/arc-deployer.env; set +a

RPC="${ARC_RPC_URL:-https://rpc.testnet.arc.network}"
echo "▸ Deployer: $DEPLOYER_ADDRESS"
echo "▸ RPC:      $RPC"
BAL=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo 0)
echo "▸ Balance:  $BAL wei"
if [ "$BAL" = "0" ]; then
  echo "!! Deployer has 0 balance — fund $DEPLOYER_ADDRESS with Arc-testnet USDC first (see docs/ARC-DEPLOY.md)."
  exit 1
fi

echo "▸ Deploying contracts to Arc Testnet…"
( cd packages/contracts && forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow )

echo "▸ Exporting ABIs + syncing web deployment for chain 5042002…"
node scripts/export-abis.mjs >/dev/null
CHAIN_ID=5042002 node scripts/sync-web.mjs

echo
echo "✅ Arc deployment complete. Addresses in packages/contracts/deployments/5042002.json"
cat packages/contracts/deployments/5042002.json
