import {describe, it, expect, beforeEach} from "vitest";
import {ShieldedLedger} from "./ledger.js";
import {deriveUnlinkAccount, transferMessage, withdrawMessage, sign, type AccountKeys} from "./account.js";

const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const seed = (n: number) => Uint8Array.from(Array(32).fill(n));

let ledger: ShieldedLedger;
let alice: AccountKeys;
let bob: AccountKeys;

async function register(acct: AccountKeys) {
  ledger.register(acct.address, acct.spendingPublicKey);
}

beforeEach(async () => {
  ledger = new ShieldedLedger();
  alice = await deriveUnlinkAccount(seed(1));
  bob = await deriveUnlinkAccount(seed(2));
  await register(alice);
  await register(bob);
});

async function signedTransfer(from: AccountKeys, to: string, amount: bigint, nonce: bigint) {
  const sig = await sign(from.spendingPrivateKey, transferMessage(to, amount, nonce));
  return ledger.transfer({from: from.address, to, token: TOKEN, amount, nonce, sig});
}

describe("ShieldedLedger", () => {
  it("credits confirmed deposits and reports balances", () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 1_000_000n, commitment: "0x0", txHash: "0x0"});
    expect(ledger.balanceOf(alice.address, TOKEN)).toBe(1_000_000n);
  });

  it("moves value on a valid signed transfer and advances the nonce", async () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 1_000_000n, commitment: "0x0", txHash: "0x0"});
    await signedTransfer(alice, bob.address, 600_000n, 0n);
    expect(ledger.balanceOf(alice.address, TOKEN)).toBe(400_000n);
    expect(ledger.balanceOf(bob.address, TOKEN)).toBe(600_000n);
    expect(ledger.nonceOf(alice.address)).toBe(1n);
  });

  it("rejects a transfer with a forged signature", async () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 1_000_000n, commitment: "0x0", txHash: "0x0"});
    // sign the wrong amount, submit a different one
    const sig = await sign(alice.spendingPrivateKey, transferMessage(bob.address, 1n, 0n));
    await expect(
      ledger.transfer({from: alice.address, to: bob.address, token: TOKEN, amount: 600_000n, nonce: 0n, sig}),
    ).rejects.toThrow(/invalid EdDSA signature/);
    expect(ledger.balanceOf(alice.address, TOKEN)).toBe(1_000_000n); // unchanged
  });

  it("enforces nonce ordering (replay protection)", async () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 1_000_000n, commitment: "0x0", txHash: "0x0"});
    await signedTransfer(alice, bob.address, 100_000n, 0n);
    await expect(signedTransfer(alice, bob.address, 100_000n, 0n)).rejects.toThrow(/bad nonce/);
  });

  it("rejects transfers exceeding the shielded balance", async () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 100n, commitment: "0x0", txHash: "0x0"});
    await expect(signedTransfer(alice, bob.address, 200n, 0n)).rejects.toThrow(/insufficient shielded balance/);
  });

  it("rejects transfers to an unregistered recipient", async () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 1_000_000n, commitment: "0x0", txHash: "0x0"});
    await expect(signedTransfer(alice, "unlink1qunknown", 1n, 0n)).rejects.toThrow(/not registered/);
  });

  it("prepares a withdrawal: debits balance, returns a unique nullifier, advances nonce", async () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 1_000_000n, commitment: "0x0", txHash: "0x0"});
    const sig = await sign(alice.spendingPrivateKey, withdrawMessage("0x000000000000000000000000000000000000dEaD", 400_000n, 0n));
    const {nullifier} = await ledger.prepareWithdraw({
      from: alice.address,
      recipientEvm: "0x000000000000000000000000000000000000dEaD",
      token: TOKEN,
      amount: 400_000n,
      nonce: 0n,
      sig,
    });
    expect(nullifier).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ledger.balanceOf(alice.address, TOKEN)).toBe(600_000n);
    expect(ledger.nonceOf(alice.address)).toBe(1n);
  });

  it("rejects a withdrawal with a forged signature", async () => {
    ledger.applyDeposit({unlinkAddress: alice.address, token: TOKEN, amount: 1_000_000n, commitment: "0x0", txHash: "0x0"});
    const sig = await sign(bob.spendingPrivateKey, withdrawMessage("0xdEaD", 1n, 0n)); // bob signs alice's withdraw
    await expect(
      ledger.prepareWithdraw({from: alice.address, recipientEvm: "0x000000000000000000000000000000000000dEaD", token: TOKEN, amount: 1n, nonce: 0n, sig}),
    ).rejects.toThrow(/invalid EdDSA signature/);
  });
});
