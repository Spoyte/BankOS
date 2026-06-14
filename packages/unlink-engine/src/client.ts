/**
 * UnlinkClient — the privacy surface the BankOS app codes against. Two implementations:
 *
 *   - LocalUnlinkClient: drives the local engine emulator + on-chain PrivacyPool (offline demo).
 *   - LiveUnlinkClient:  wraps the real hosted Unlink engine via `@unlink-xyz/sdk` createUnlink().
 *
 * Both share the same real Unlink account model (unlink1… addresses, EdDSA, poseidon) from account.ts,
 * so switching providers does not change account identity.
 */
import type {Address, Hex, PublicClient, WalletClient} from "viem";
import {abis} from "@bankos/shared/abis";
import {
  type AccountKeys,
  depositCommitment,
  transferMessage,
  withdrawMessage,
  sign,
  serializeSig,
} from "./account.js";

export interface DepositResult {
  txHash: Hex;
  commitment: Hex;
}
export interface WithdrawResult {
  txHash: Hex;
  nullifier: Hex;
}

export interface UnlinkClient {
  getAddress(): string;
  register(): Promise<void>;
  getBalance(token: Address): Promise<bigint>;
  /** Shield USDC: on-chain deposit into PrivacyPool, credited to the private balance. */
  deposit(token: Address, amount: bigint): Promise<DepositResult>;
  /** Move value privately to another unlink1… account — never touches the chain. */
  privateTransfer(token: Address, recipientUnlink: string, amount: bigint): Promise<void>;
  /** Exit to a (fresh) EVM address; settled on-chain by the engine relayer. */
  withdraw(token: Address, recipientEvm: Address, amount: bigint): Promise<WithdrawResult>;
}

function randomBlinding(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

export interface LocalUnlinkOptions {
  account: AccountKeys;
  engineUrl: string;
  walletClient: WalletClient; // member's EVM signer (Dynamic in the app, a key in the CLI)
  publicClient: PublicClient;
  privacyPool: Address;
}

export class LocalUnlinkClient implements UnlinkClient {
  constructor(private readonly o: LocalUnlinkOptions) {}

  getAddress(): string {
    return this.o.account.address;
  }

  private async api(path: string, body?: unknown) {
    const res = await fetch(`${this.o.engineUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? {"content-type": "application/json"} : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `engine ${path} failed`);
    return json;
  }

  async register(): Promise<void> {
    const [x, y] = this.o.account.spendingPublicKey;
    await this.api("/register", {
      unlinkAddress: this.o.account.address,
      spendingPublicKey: [x.toString(), y.toString()],
    });
  }

  async getBalance(token: Address): Promise<bigint> {
    const {balance} = await this.api(`/balance/${this.o.account.address}/${token}`);
    return BigInt(balance);
  }

  private async nonce(): Promise<bigint> {
    const {nonce} = await this.api(`/nonce/${this.o.account.address}`);
    return BigInt(nonce);
  }

  async deposit(token: Address, amount: bigint): Promise<DepositResult> {
    const commitment = depositCommitment(this.o.account.masterPublicKey, amount, randomBlinding());
    const acct = this.o.walletClient.account!;

    // approve + deposit into PrivacyPool
    const approveHash = await this.o.walletClient.writeContract({
      account: acct,
      chain: this.o.walletClient.chain,
      address: token,
      abi: abis.MockUSDC,
      functionName: "approve",
      args: [this.o.privacyPool, amount],
    });
    await this.o.publicClient.waitForTransactionReceipt({hash: approveHash});

    const txHash = await this.o.walletClient.writeContract({
      account: acct,
      chain: this.o.walletClient.chain,
      address: this.o.privacyPool,
      abi: abis.PrivacyPool,
      functionName: "deposit",
      args: [commitment, amount],
    });
    await this.o.publicClient.waitForTransactionReceipt({hash: txHash});

    await this.api("/deposit", {
      unlinkAddress: this.o.account.address,
      token,
      amount: amount.toString(),
      commitment,
      txHash,
    });
    return {txHash, commitment};
  }

  async privateTransfer(token: Address, recipientUnlink: string, amount: bigint): Promise<void> {
    const nonce = await this.nonce();
    const msg = transferMessage(recipientUnlink, amount, nonce);
    const sig = await sign(this.o.account.spendingPrivateKey, msg);
    await this.api("/transfer", {
      from: this.o.account.address,
      to: recipientUnlink,
      token,
      amount: amount.toString(),
      nonce: nonce.toString(),
      sig: serializeSig(sig),
    });
  }

  async withdraw(token: Address, recipientEvm: Address, amount: bigint): Promise<WithdrawResult> {
    const nonce = await this.nonce();
    const msg = withdrawMessage(recipientEvm, amount, nonce);
    const sig = await sign(this.o.account.spendingPrivateKey, msg);
    const r = await this.api("/withdraw", {
      from: this.o.account.address,
      recipientEvm,
      token,
      amount: amount.toString(),
      nonce: nonce.toString(),
      sig: serializeSig(sig),
    });
    return {txHash: r.txHash, nullifier: r.nullifier};
  }
}
