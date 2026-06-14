/**
 * Unlink privacy demo: shield → private transfer → withdraw, proving what is visible on-chain
 * versus what stays private. Requires anvil + a deploy + the engine running (see scripts/demo.sh,
 * or: npm run engine:dev).
 *
 *   npm run -w @bankos/unlink-engine demo
 */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {abis} from "@bankos/shared/abis";
import {chainById, fromUsdc, toUsdc, type Deployment} from "@bankos/shared";
import {deriveUnlinkAccount} from "./account.js";
import {LocalUnlinkClient} from "./client.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const chainId = Number(process.env.CHAIN_ID ?? 31337);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const engineUrl = process.env.ENGINE_URL ?? "http://127.0.0.1:4002";
const chain = chainById(chainId);
const dep = JSON.parse(
  readFileSync(join(__dir, "..", "..", "contracts", "deployments", `${chainId}.json`), "utf8"),
) as Deployment;

const publicClient = createPublicClient({chain, transport: http(rpcUrl)});

// anvil keys: alice #3, bob #4, fresh recipient #7
const ALICE = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex;
const BOB = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex;
const FRESH = privateKeyToAccount(
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356" as Hex,
);

function wallet(pk: Hex) {
  const account = privateKeyToAccount(pk);
  return {account, client: createWalletClient({account, chain, transport: http(rpcUrl)})};
}

function seedFrom(label: string): Uint8Array {
  return Uint8Array.from(Buffer.from(keccak256(toHex(label)).slice(2), "hex"));
}

async function main() {
  console.log("\n== Unlink privacy demo (shield → private transfer → withdraw) ==\n");

  const aliceEvm = wallet(ALICE);
  const bobEvm = wallet(BOB);

  const aliceAcct = await deriveUnlinkAccount(seedFrom("charter:alice"));
  const bobAcct = await deriveUnlinkAccount(seedFrom("charter:bob"));
  console.log(`alice unlink: ${aliceAcct.address.slice(0, 26)}…`);
  console.log(`bob   unlink: ${bobAcct.address.slice(0, 26)}…\n`);

  const alice = new LocalUnlinkClient({
    account: aliceAcct,
    engineUrl,
    walletClient: aliceEvm.client,
    publicClient,
    privacyPool: dep.privacyPool,
  });
  const bob = new LocalUnlinkClient({
    account: bobAcct,
    engineUrl,
    walletClient: bobEvm.client,
    publicClient,
    privacyPool: dep.privacyPool,
  });

  await alice.register();
  await bob.register();

  // alice needs USDC
  await publicClient.waitForTransactionReceipt({
    hash: await aliceEvm.client.writeContract({
      address: dep.usdc,
      abi: abis.MockUSDC,
      functionName: "mint",
      args: [aliceEvm.account.address, toUsdc("1000")],
    }),
  });

  console.log("1) alice shields 1000 USDC into the privacy pool (on-chain deposit)…");
  const d = await alice.deposit(dep.usdc, toUsdc("1000"));
  console.log(`   tx ${d.txHash.slice(0, 14)}…  commitment ${d.commitment.slice(0, 14)}…`);
  console.log(`   alice shielded balance: ${fromUsdc(await alice.getBalance(dep.usdc))} USDC\n`);

  console.log("2) alice privately transfers 600 USDC to bob (OFF-CHAIN — no tx, hidden)…");
  await alice.privateTransfer(dep.usdc, bobAcct.address, toUsdc("600"));
  console.log(`   alice: ${fromUsdc(await alice.getBalance(dep.usdc))} USDC   bob: ${fromUsdc(await bob.getBalance(dep.usdc))} USDC\n`);

  console.log(`3) bob withdraws 600 USDC to a FRESH address ${FRESH.address.slice(0, 10)}… (on-chain settle)…`);
  const before = (await publicClient.readContract({
    address: dep.usdc,
    abi: abis.MockUSDC,
    functionName: "balanceOf",
    args: [FRESH.address],
  })) as bigint;
  const w = await bob.withdraw(dep.usdc, FRESH.address, toUsdc("600"));
  const after = (await publicClient.readContract({
    address: dep.usdc,
    abi: abis.MockUSDC,
    functionName: "balanceOf",
    args: [FRESH.address],
  })) as bigint;
  console.log(`   tx ${w.txHash.slice(0, 14)}…  fresh address received ${fromUsdc(after - before)} USDC`);
  console.log(`   bob shielded balance: ${fromUsdc(await bob.getBalance(dep.usdc))} USDC\n`);

  // What an on-chain observer sees
  const logs = await publicClient.getLogs({address: dep.privacyPool, fromBlock: 0n});
  const dep_ev = parseEventLogs({abi: abis.PrivacyPool, logs, eventName: "Deposited"});
  const wd_ev = parseEventLogs({abi: abis.PrivacyPool, logs, eventName: "Withdrawn"});
  console.log("== What an on-chain observer sees ==");
  console.log(`  Deposited events: ${dep_ev.length}  (depositor + amount, but not who owns it after)`);
  console.log(`  Withdrawn events: ${wd_ev.length}  (recipient + amount, unlinked from the depositor)`);
  console.log(`  The alice→bob transfer of 600 USDC: NOT on chain. Balances + history stay private.`);
  console.log("\nUnlink privacy demo complete ✅");
}

main().catch((e) => {
  console.error("demo failed:", e?.message ?? e);
  console.error("(is the engine running? `npm run engine:dev`)");
  process.exit(1);
});
