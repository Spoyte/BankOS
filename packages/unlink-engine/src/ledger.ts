/**
 * In-memory shielded ledger for the local Unlink engine emulator. Balances and transfers live here,
 * NOT on-chain — that is where Unlink's privacy comes from. Every spend is authorized by a real
 * EdDSA signature over a poseidon message, verified against the account's spending public key.
 */
import {
  verify,
  transferMessage,
  withdrawMessage,
  withdrawNullifier,
  type EdDSASignature,
} from "./account.js";

interface Account {
  spendingPublicKey: [bigint, bigint];
  balances: Map<string, bigint>; // token(lowercased) -> amount
  nonce: bigint;
}

export interface DepositRecord {
  unlinkAddress: string;
  token: string;
  amount: bigint;
  commitment: `0x${string}`;
  txHash: string;
}

export class ShieldedLedger {
  private accounts = new Map<string, Account>();
  private deposits: DepositRecord[] = [];
  private nullifiers = new Set<string>();
  // Accounts with an in-flight withdrawal (on-chain settlement pending). Blocks concurrent spends so a
  // withdrawal's balance/nonce/nullifier are only mutated AFTER its on-chain tx confirms (atomicity).
  private withdrawInFlight = new Set<string>();

  register(unlinkAddress: string, spendingPublicKey: [bigint, bigint]) {
    if (!this.accounts.has(unlinkAddress)) {
      this.accounts.set(unlinkAddress, {spendingPublicKey, balances: new Map(), nonce: 0n});
    } else {
      // refresh pubkey (idempotent re-register)
      this.accounts.get(unlinkAddress)!.spendingPublicKey = spendingPublicKey;
    }
  }

  private require(unlinkAddress: string): Account {
    const a = this.accounts.get(unlinkAddress);
    if (!a) throw new Error(`unknown unlink account ${unlinkAddress}`);
    return a;
  }

  isRegistered(unlinkAddress: string): boolean {
    return this.accounts.has(unlinkAddress);
  }

  nonceOf(unlinkAddress: string): bigint {
    return this.require(unlinkAddress).nonce;
  }

  balanceOf(unlinkAddress: string, token: string): bigint {
    const a = this.accounts.get(unlinkAddress);
    return a?.balances.get(token.toLowerCase()) ?? 0n;
  }

  private credit(unlinkAddress: string, token: string, amount: bigint) {
    const a = this.require(unlinkAddress);
    const t = token.toLowerCase();
    a.balances.set(t, (a.balances.get(t) ?? 0n) + amount);
  }

  private debit(unlinkAddress: string, token: string, amount: bigint) {
    const a = this.require(unlinkAddress);
    const t = token.toLowerCase();
    const bal = a.balances.get(t) ?? 0n;
    if (bal < amount) throw new Error("insufficient shielded balance");
    a.balances.set(t, bal - amount);
  }

  /** Credit a confirmed on-chain deposit into the shielded balance. */
  applyDeposit(rec: DepositRecord) {
    this.credit(rec.unlinkAddress, rec.token, rec.amount);
    this.deposits.push(rec);
  }

  /** Verify + apply a private transfer (off-chain, hidden). */
  async transfer(params: {
    from: string;
    to: string;
    token: string;
    amount: bigint;
    nonce: bigint;
    sig: EdDSASignature;
  }) {
    const acct = this.require(params.from);
    if (this.withdrawInFlight.has(params.from)) throw new Error("a withdrawal is settling on-chain; retry shortly");
    if (params.nonce !== acct.nonce) throw new Error(`bad nonce: expected ${acct.nonce}`);
    if (!this.isRegistered(params.to)) throw new Error("recipient not registered");

    const msg = transferMessage(params.to, params.amount, params.nonce);
    const ok = await verify(msg, params.sig, acct.spendingPublicKey);
    if (!ok) throw new Error("invalid EdDSA signature");

    this.debit(params.from, params.token, params.amount);
    this.credit(params.to, params.token, params.amount);
    acct.nonce += 1n;
  }

  /**
   * Verify + apply a private FX swap (feature #10): debit one shielded currency, credit another at the
   * engine-computed rate. Authorized by an EdDSA signature over a transfer-to-self message, so only the
   * account owner can swap their own funds. Stays entirely within the shielded ledger (private).
   */
  async fxSwap(params: {
    unlinkAddress: string;
    fromToken: string;
    toToken: string;
    amountIn: bigint;
    amountOut: bigint;
    nonce: bigint;
    sig: EdDSASignature;
  }) {
    const acct = this.require(params.unlinkAddress);
    if (this.withdrawInFlight.has(params.unlinkAddress)) throw new Error("a withdrawal is settling on-chain; retry shortly");
    if (params.nonce !== acct.nonce) throw new Error(`bad nonce: expected ${acct.nonce}`);

    const msg = transferMessage(params.unlinkAddress, params.amountIn, params.nonce);
    const ok = await verify(msg, params.sig, acct.spendingPublicKey);
    if (!ok) throw new Error("invalid EdDSA signature");

    this.debit(params.unlinkAddress, params.fromToken, params.amountIn);
    this.credit(params.unlinkAddress, params.toToken, params.amountOut);
    acct.nonce += 1n;
  }

  /**
   * Withdrawal step 1 — VALIDATE ONLY (no balance mutation). Verifies the nonce, signature, nullifier
   * freshness and sufficient balance, marks the account in-flight, and returns the nullifier the relayer
   * will settle. Crucially it does NOT debit: if the on-chain `PrivacyPool.withdraw` later fails, the
   * shielded balance is untouched (no loss of funds). Caller MUST follow with `commitWithdraw` on a
   * confirmed receipt, or `abortWithdraw` on failure.
   */
  async validateWithdraw(params: {
    from: string;
    recipientEvm: string;
    token: string;
    amount: bigint;
    nonce: bigint;
    sig: EdDSASignature;
  }): Promise<{nullifier: `0x${string}`}> {
    const acct = this.require(params.from);
    if (this.withdrawInFlight.has(params.from)) throw new Error("a withdrawal is already settling for this account");
    if (params.nonce !== acct.nonce) throw new Error(`bad nonce: expected ${acct.nonce}`);

    const msg = withdrawMessage(params.recipientEvm, params.amount, params.nonce);
    const ok = await verify(msg, params.sig, acct.spendingPublicKey);
    if (!ok) throw new Error("invalid EdDSA signature");

    const nullifier = withdrawNullifier(params.from, params.nonce);
    if (this.nullifiers.has(nullifier)) throw new Error("nullifier already used");
    if (this.balanceOf(params.from, params.token) < params.amount) {
      throw new Error("insufficient shielded balance");
    }

    this.withdrawInFlight.add(params.from);
    return {nullifier};
  }

  /** Withdrawal step 2 — COMMIT, only after the on-chain settlement is confirmed: debit, burn the
   *  nullifier, bump the nonce, release the in-flight lock. */
  commitWithdraw(params: {from: string; token: string; amount: bigint; nonce: bigint; nullifier: `0x${string}`}) {
    const acct = this.require(params.from);
    // Defensive re-checks (the in-flight lock should already guarantee these held since validate).
    if (acct.nonce !== params.nonce) throw new Error("account nonce changed during settlement");
    if (this.nullifiers.has(params.nullifier)) throw new Error("nullifier already used");
    this.debit(params.from, params.token, params.amount);
    this.nullifiers.add(params.nullifier);
    acct.nonce += 1n;
    this.withdrawInFlight.delete(params.from);
  }

  /** Withdrawal abort — release the in-flight lock when the on-chain settlement failed. Nothing was
   *  debited, so the shielded balance and nonce are unchanged and the member can retry. */
  abortWithdraw(from: string) {
    this.withdrawInFlight.delete(from);
  }

  stats() {
    return {
      accounts: this.accounts.size,
      deposits: this.deposits.length,
      nullifiers: this.nullifiers.size,
    };
  }
}
