#!/usr/bin/env node
// Copy the active deployment into the web app so it can import addresses at build time.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chainId = process.env.CHAIN_ID ?? "31337";
const src = join(root, "packages/contracts/deployments", `${chainId}.json`);
const destDir = join(root, "packages/web/src/generated");
mkdirSync(destDir, {recursive: true});

if (!existsSync(src)) {
  console.error(`! no deployment at ${src} — run npm run deploy:local first`);
  // still write an empty placeholder so the app type-checks
  writeFileSync(join(destDir, "deployment.json"), JSON.stringify({chainId: Number(chainId)}, null, 2));
  process.exit(0);
}
const dep = readFileSync(src, "utf8");
writeFileSync(join(destDir, "deployment.json"), dep);
console.log(`synced deployment ${chainId} → packages/web/src/generated/deployment.json`);
