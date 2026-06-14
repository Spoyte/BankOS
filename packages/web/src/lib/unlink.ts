import {keccak256, hexToBytes, type Address, type WalletClient} from "viem";
import {deriveUnlinkAccount} from "@bankos/unlink-engine/account";
import {LocalUnlinkClient, type UnlinkClient} from "@bankos/unlink-engine";
import {ENGINE_URL, deployment} from "../config";
import {publicClient} from "../wallet/WalletContext";

const SEED_MESSAGE = "BankOS • derive my private Unlink account (v1)";
const cache = new Map<string, UnlinkClient>();

/**
 * Build the member's Unlink client. The private account is derived deterministically from a wallet
 * signature, so the spending key never needs separate custody and is reproducible on any device.
 */
export async function getUnlinkClient(walletClient: WalletClient, address: Address): Promise<UnlinkClient> {
  const key = address.toLowerCase();
  const existing = cache.get(key);
  if (existing) return existing;

  const signature = await walletClient.signMessage({account: walletClient.account!, message: SEED_MESSAGE});
  const seed = hexToBytes(keccak256(signature)); // 32-byte deterministic seed
  const account = await deriveUnlinkAccount(seed);

  const client = new LocalUnlinkClient({
    account,
    engineUrl: ENGINE_URL,
    walletClient,
    publicClient,
    privacyPool: deployment.privacyPool,
  });
  await client.register();
  cache.set(key, client);
  return client;
}

export function clearUnlinkCache() {
  cache.clear();
}
