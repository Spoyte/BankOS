/**
 * LiveUnlinkClient — the production privacy path, backed by the real hosted Unlink engine via
 * `@unlink-xyz/sdk`. Enabled when UNLINK_ENGINE_URL + UNLINK_API_KEY are configured (e.g. the
 * Arc-testnet hosted environment). Account identity (unlink1… address) is shared with the local
 * client through the same `@unlink-xyz/sdk` account derivation.
 */
import {createUnlink, unlinkAccount, unlinkEvm} from "@unlink-xyz/sdk";
import type {Address, PublicClient, WalletClient} from "viem";
import type {AccountKeys} from "./account.js";
import type {UnlinkClient, DepositResult, WithdrawResult} from "./client.js";

export interface LiveUnlinkOptions {
  account: AccountKeys;
  engineUrl: string; // hosted Unlink engine
  apiKey: string;
  walletClient: WalletClient;
  publicClient: PublicClient;
  environment: string; // e.g. "arc-testnet"
}

export class LiveUnlinkClient implements UnlinkClient {
  private readonly unlink;
  private readonly env: string;

  constructor(private readonly o: LiveUnlinkOptions) {
    this.env = o.environment;
    this.unlink = createUnlink({
      engineUrl: o.engineUrl,
      apiKey: o.apiKey,
      account: unlinkAccount.fromKeys(o.account),
      evm: unlinkEvm.fromViem({
        walletClient: o.walletClient as never,
        publicClient: o.publicClient as never,
      }),
    });
  }

  getAddress(): string {
    return this.o.account.address;
  }

  async register(): Promise<void> {
    await this.unlink.ensureRegistered();
  }

  async getBalance(token: Address): Promise<bigint> {
    const balances = await this.unlink.getBalances({token});
    const entry = (balances as any).balances?.find(
      (b: any) => b.token?.toLowerCase() === token.toLowerCase(),
    );
    return BigInt(entry?.amount ?? "0");
  }

  async deposit(token: Address, amount: bigint): Promise<DepositResult> {
    await this.unlink.ensureErc20Approval({token, amount: amount.toString()});
    const r = await this.unlink.deposit({token, amount: amount.toString()});
    const settled = await this.unlink.pollTransactionStatus(r.txId);
    return {txHash: (settled as any).txHash ?? "0x", commitment: "0x"};
  }

  async privateTransfer(token: Address, recipientUnlink: string, amount: bigint): Promise<void> {
    await this.unlink.transfer({token, amount: amount.toString(), recipientAddress: recipientUnlink});
  }

  async withdraw(token: Address, recipientEvm: Address, amount: bigint): Promise<WithdrawResult> {
    const r = await this.unlink.withdraw({
      token,
      amount: amount.toString(),
      recipientEvmAddress: recipientEvm,
    });
    return {txHash: (r as any).txHash ?? "0x", nullifier: "0x"};
  }
}
