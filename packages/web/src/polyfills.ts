/**
 * Node globals that some crypto dependencies assume exist. `@unlink-xyz/sdk`'s EdDSA path pulls in
 * `@zk-kit/eddsa-poseidon` (blake-2b), which references the Node `Buffer` global directly — undefined
 * in the browser. Imported first in main.tsx so these are set before any SDK code runs.
 */
import {Buffer} from "buffer";

const g = globalThis as unknown as {
  Buffer?: unknown;
  global?: unknown;
  process?: {env: Record<string, string>};
};

if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
if (!g.process) g.process = {env: {}};
