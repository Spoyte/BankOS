/**
 * Charter's Unlink account + message helpers, built on the REAL `@unlink-xyz/sdk` cryptography.
 *
 * What is genuinely Unlink here:
 *   - account derivation from a seed (`deriveAccountKeys`) → real `unlink1…` addresses
 *   - poseidon note commitments
 *   - EdDSA (BN254) signing/verification of transfer + withdraw authorizations
 *
 * Only the *ledger/relayer* (the engine) is emulated locally; swap in the hosted Unlink engine via
 * `LiveUnlinkClient` and these same accounts/addresses are used.
 */
import {
  deriveAccountKeys,
  eddsaSign,
  eddsaVerify,
  poseidon,
  BN254_FIELD_ORDER,
  type AccountKeys,
  type EdDSASignature,
} from "@unlink-xyz/sdk";
import {keccak256, toHex, stringToBytes} from "viem";

export type {AccountKeys, EdDSASignature};

/** Derive a full Unlink account (spending/viewing keys + unlink1… address) from a 32-byte seed. */
export async function deriveUnlinkAccount(seed: Uint8Array, index = 0): Promise<AccountKeys> {
  return deriveAccountKeys(seed, index);
}

/** Reduce an arbitrary string (an unlink1… or 0x… address) to a BN254 field element. */
export function addrField(addr: string): bigint {
  return BigInt(keccak256(toHex(stringToBytes(addr)))) % BN254_FIELD_ORDER;
}

const TRANSFER_TAG = 1n;
const WITHDRAW_TAG = 2n;

/** Message a sender signs (EdDSA) to authorize a private transfer. */
export function transferMessage(recipientUnlink: string, amount: bigint, nonce: bigint): bigint {
  return poseidon([TRANSFER_TAG, addrField(recipientUnlink), amount, nonce]);
}

/** Message a spender signs (EdDSA) to authorize an on-chain withdrawal. */
export function withdrawMessage(recipientEvm: string, amount: bigint, nonce: bigint): bigint {
  return poseidon([WITHDRAW_TAG, BigInt(recipientEvm), amount, nonce]);
}

/** Poseidon note commitment for a shielded deposit (binds amount + owner + a blinding factor). */
export function depositCommitment(masterPublicKey: bigint, amount: bigint, blinding: bigint): `0x${string}` {
  const c = poseidon([masterPublicKey, amount, blinding]);
  return `0x${c.toString(16).padStart(64, "0")}` as `0x${string}`;
}

/** Deterministic on-chain nullifier (bytes32) for a withdrawal. */
export function withdrawNullifier(unlinkAddress: string, nonce: bigint): `0x${string}` {
  return keccak256(toHex(stringToBytes(`${unlinkAddress}:${nonce}`)));
}

export async function sign(spendingPrivateKey: bigint, message: bigint): Promise<EdDSASignature> {
  return eddsaSign(spendingPrivateKey, message);
}

export async function verify(
  message: bigint,
  sig: EdDSASignature,
  spendingPublicKey: [bigint, bigint],
): Promise<boolean> {
  return eddsaVerify(message, sig, spendingPublicKey);
}

/** Serialize an EdDSA signature to JSON-safe decimal strings (for the engine HTTP API). */
export function serializeSig(sig: EdDSASignature) {
  return {R8: [sig.R8[0].toString(), sig.R8[1].toString()], S: sig.S.toString()};
}
export function deserializeSig(s: {R8: [string, string]; S: string}): EdDSASignature {
  return {R8: [BigInt(s.R8[0]), BigInt(s.R8[1])], S: BigInt(s.S)};
}
