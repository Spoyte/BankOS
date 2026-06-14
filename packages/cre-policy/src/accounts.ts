import {createWalletClient, createPublicClient, http, type Hex, type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {chainById} from "@bankos/shared";

const chainId = Number(process.env.CHAIN_ID ?? 31337);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
export const chain = chainById(chainId);

export const publicClient = createPublicClient({chain, transport: http(rpcUrl)});

export function wallet(pk: Hex) {
  const account = privateKeyToAccount(pk);
  return {account, client: createWalletClient({account, chain, transport: http(rpcUrl)})};
}

/** Default anvil accounts used across the local demo. */
export const ANVIL = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  attester: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  steward: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  alice: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  bob: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  carol: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
} as const satisfies Record<string, Hex>;

export const addr = (pk: Hex): Address => privateKeyToAccount(pk).address;
