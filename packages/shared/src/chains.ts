import {defineChain} from "viem";

/// Arc Testnet — Circle's stablecoin-native L1. USDC is the native gas token.
/// RPC/chainId/explorer confirmed from sponsor docs (2026-06).
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {name: "USDC", symbol: "USDC", decimals: 18},
  rpcUrls: {default: {http: ["https://rpc.testnet.arc.network"]}},
  blockExplorers: {default: {name: "Arcscan", url: "https://testnet.arcscan.app"}},
  testnet: true,
});

/// Local anvil chain standing in for Arc during development (Arc is EVM-compatible).
export const localArc = defineChain({
  id: 31337,
  name: "Local Arc (anvil)",
  nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
  rpcUrls: {default: {http: ["http://127.0.0.1:8545"]}},
  testnet: true,
});

/// Canonical token addresses on Arc. Native gas is USDC (18 dp); the ERC-20 interface is 6 dp.
export const ARC_USDC_ERC20 = "0x3600000000000000000000000000000000000000" as const;
export const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

export const SUPPORTED_CHAINS = {
  arcTestnet,
  localArc,
} as const;

export function chainById(id: number) {
  if (id === arcTestnet.id) return arcTestnet;
  return localArc;
}
