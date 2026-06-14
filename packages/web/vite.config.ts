import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    fs: {allow: [repoRoot]},
  },
  resolve: {
    dedupe: ["viem", "react", "react-dom"],
    alias: {
      // @unlink-xyz/sdk loads EdDSA via Node's createRequire (see src/lib/eddsa-shim.ts). Shim both the
      // `module` builtin and zk-kit's CJS-only blake-2b build so private accounts work in the browser.
      module: join(here, "src/lib/eddsa-shim.ts"),
      "@zk-kit/eddsa-poseidon/blake-2b": join(
        repoRoot,
        "node_modules/@zk-kit/eddsa-poseidon/dist/lib.commonjs/eddsa-poseidon-blake-2b.cjs",
      ),
    },
  },
});
