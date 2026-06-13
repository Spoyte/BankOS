export * from "./chains.js";
export * from "./types.js";
export {abis} from "./abis.js";

import type {Address} from "viem";

/// Deployed contract addresses for a given chain (shape of deployments/<chainId>.json).
export interface Deployment {
  chainId: number;
  usdc: Address;
  policyRegistry: Address;
  executionRouter: Address;
  charterFactory: Address;
  bankImplementation: Address;
  yieldVault: Address;
  privacyPool: Address;
  attester: Address;
  engineRelayer: Address;
}
