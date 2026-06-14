/**
 * Browser shim for `@unlink-xyz/sdk`'s Node-only EdDSA loader.
 *
 * The SDK derives EdDSA keys/signatures via:
 *     const { createRequire } = await import("module");
 *     createRequire(import.meta.url)("@zk-kit/eddsa-poseidon/blake-2b");
 * `createRequire` doesn't exist in the browser, so this broke private-account derivation in the web app
 * (it only ever ran in the Node engine/CLI). zk-kit ships blake-2b *only* as CommonJS — its ESM path is
 * missing from the package — which is why the SDK uses `require` at all.
 *
 * We statically import the real (dependency-free, browser-safe) CJS build and hand it back through a
 * `createRequire` shim, so the browser runs the exact same EdDSA implementation as the Node engine and
 * derived accounts/signatures stay byte-compatible. Wired up via `resolve.alias` in vite.config.ts:
 *   - `module` → this file
 *   - `@zk-kit/eddsa-poseidon/blake-2b` → the package's `.cjs` build
 */
import * as blake2b from "@zk-kit/eddsa-poseidon/blake-2b";

const REGISTRY: Record<string, unknown> = {
  "@zk-kit/eddsa-poseidon/blake-2b": (blake2b as {default?: unknown}).default ?? blake2b,
};

export function createRequire(): (id: string) => unknown {
  return (id: string) => {
    const mod = REGISTRY[id];
    if (!mod) throw new Error(`eddsa-shim: unsupported require("${id}") in browser`);
    return mod;
  };
}

export default {createRequire};
