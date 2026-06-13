import {chainById, type Deployment} from "@charter/shared";
import deploymentJson from "./generated/deployment.json";

export const deployment = deploymentJson as unknown as Deployment;
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? deployment.chainId ?? 31337);
export const chain = chainById(CHAIN_ID);
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? chain.rpcUrls.default.http[0];
export const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? "http://127.0.0.1:4002";
export const POLICY_URL = import.meta.env.VITE_POLICY_URL ?? "http://127.0.0.1:4001";

/** Set VITE_DYNAMIC_ENVIRONMENT_ID to use Dynamic embedded wallets; otherwise the local dev wallet. */
export const DYNAMIC_ENV_ID = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID as string | undefined;

/** LI.FI treasury routing is a feature-flagged stretch (see ADR-001). */
export const ENABLE_LIFI = import.meta.env.VITE_ENABLE_LIFI === "true";

export const isLocal = CHAIN_ID === 31337;

/** Block-explorer URL for a tx (e.g. arcscan on Arc testnet), or undefined on local anvil. */
export function txUrl(hash: string): string | undefined {
  const base = chain.blockExplorers?.default?.url;
  return base ? `${base}/tx/${hash}` : undefined;
}
