import type {Address, Hex, PublicClient, WalletClient} from "viem";

export interface WalletState {
  mode: "local" | "dynamic";
  address?: Address;
  label?: string;
  walletClient?: WalletClient;
  publicClient: PublicClient;
  isConnected: boolean;
  connect: () => void | Promise<void>;
  disconnect: () => void | Promise<void>;
  // local-mode persona switching (no-ops in dynamic mode)
  localAccounts?: LocalAccount[];
  selectLocal?: (id: string) => void;
}

export interface LocalAccount {
  id: string;
  label: string;
  role: "steward" | "member";
  address: Address;
  pk: Hex;
}

/** Named anvil personas for the offline demo (avoids deployer #0/#1 and engine relayer #5). */
export const LOCAL_ACCOUNTS: LocalAccount[] = [
  {id: "steward", label: "Steward (operator)", role: "steward", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", pk: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"},
  {id: "alice", label: "Alice (member)", role: "member", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", pk: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"},
  {id: "bob", label: "Bob (member)", role: "member", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", pk: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"},
  {id: "dave", label: "Dave (new member)", role: "member", address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", pk: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"},
];
