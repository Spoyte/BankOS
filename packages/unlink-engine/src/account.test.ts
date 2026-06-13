import {describe, it, expect} from "vitest";
import {
  deriveUnlinkAccount,
  addrField,
  transferMessage,
  withdrawMessage,
  withdrawNullifier,
  depositCommitment,
  sign,
  verify,
  serializeSig,
  deserializeSig,
} from "./account.js";

const seed = (n: number) => Uint8Array.from(Array(32).fill(n));

describe("unlink account crypto", () => {
  it("derives a deterministic unlink1… account from a seed", async () => {
    const a = await deriveUnlinkAccount(seed(7));
    const b = await deriveUnlinkAccount(seed(7));
    expect(a.address).toBe(b.address);
    expect(a.address.startsWith("unlink1")).toBe(true);
    const c = await deriveUnlinkAccount(seed(8));
    expect(c.address).not.toBe(a.address);
  });

  it("EdDSA sign/verify round-trips and rejects tampering", async () => {
    const acct = await deriveUnlinkAccount(seed(3));
    const msg = transferMessage("unlink1recipient", 1_000_000n, 0n);
    const sig = await sign(acct.spendingPrivateKey, msg);
    expect(await verify(msg, sig, acct.spendingPublicKey)).toBe(true);
    // tampered message must not verify
    const other = transferMessage("unlink1recipient", 1_000_001n, 0n);
    expect(await verify(other, sig, acct.spendingPublicKey)).toBe(false);
  });

  it("message hashing is deterministic and binds its fields", () => {
    expect(transferMessage("unlink1x", 5n, 1n)).toBe(transferMessage("unlink1x", 5n, 1n));
    expect(transferMessage("unlink1x", 5n, 1n)).not.toBe(transferMessage("unlink1x", 6n, 1n));
    expect(transferMessage("unlink1x", 5n, 1n)).not.toBe(transferMessage("unlink1y", 5n, 1n));
    expect(withdrawMessage("0x000000000000000000000000000000000000dEaD", 5n, 0n)).toBeTypeOf("bigint");
  });

  it("addrField reduces any string into the BN254 field", () => {
    const f = addrField("unlink1qsomeaddress");
    expect(f).toBeTypeOf("bigint");
    expect(f > 0n).toBe(true);
  });

  it("deposit commitments are 32-byte hex and depend on the blinding factor", () => {
    const c1 = depositCommitment(123n, 1_000_000n, 1n);
    const c2 = depositCommitment(123n, 1_000_000n, 2n);
    expect(c1).toMatch(/^0x[0-9a-f]{64}$/);
    expect(c1).not.toBe(c2);
  });

  it("withdrawal nullifiers are globally unique (random salt) to avoid pool collisions on restart", () => {
    const n1 = withdrawNullifier("unlink1x", 0n);
    const n2 = withdrawNullifier("unlink1x", 0n); // same inputs, must still differ
    expect(n1).toMatch(/^0x[0-9a-f]{64}$/);
    expect(n1).not.toBe(n2);
  });

  it("serializes and deserializes an EdDSA signature losslessly", async () => {
    const acct = await deriveUnlinkAccount(seed(5));
    const sig = await sign(acct.spendingPrivateKey, 42n);
    const round = deserializeSig(serializeSig(sig));
    expect(round.S).toBe(sig.S);
    expect(round.R8[0]).toBe(sig.R8[0]);
    expect(round.R8[1]).toBe(sig.R8[1]);
  });
});
