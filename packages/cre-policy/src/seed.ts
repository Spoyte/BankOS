/**
 * Seed a rich local demo: charter a bank, onboard members through the compliance pipeline
 * (evaluate → attest on-chain), deposit, open a credit line + borrow, and route reserve into the
 * yield vault. Exercises the whole contract suite end-to-end via viem.
 *
 *   npm run seed   (with anvil + a deploy in place)
 */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {type Address, type Hex} from "viem";
import {abis} from "@charter/shared/abis";
import {toUsdc, fromUsdc, type Deployment} from "@charter/shared";
import {publicClient, wallet, ANVIL, addr} from "./accounts.js";
import {evaluateCompliance, type KycPayload} from "./compliance.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const chainId = Number(process.env.CHAIN_ID ?? 31337);
const dep = JSON.parse(
  readFileSync(
    process.env.DEPLOYMENT_PATH ?? join(__dir, "..", "..", "contracts", "deployments", `${chainId}.json`),
    "utf8",
  ),
) as Deployment;

const steward = wallet(ANVIL.steward);
const attester = wallet(ANVIL.attester);

async function waitTx(hash: Hex) {
  await publicClient.waitForTransactionReceipt({hash});
}

async function mintAndApprove(pk: Hex, amount: bigint, spender: Address) {
  const w = wallet(pk);
  await waitTx(
    await w.client.writeContract({address: dep.usdc, abi: abis.MockUSDC, functionName: "mint", args: [w.account.address, amount]}),
  );
  await waitTx(
    await w.client.writeContract({address: dep.usdc, abi: abis.MockUSDC, functionName: "approve", args: [spender, amount]}),
  );
}

async function attest(bank: Address, member: Address, kyc: KycPayload) {
  const {approved, policy, reasons} = evaluateCompliance(kyc);
  console.log(`  • compliance(${member.slice(0, 8)}…) approved=${approved} tier=${policy.tier} :: ${reasons[0]}`);
  if (!approved) return false;
  await waitTx(
    await attester.client.writeContract({
      address: dep.policyRegistry,
      abi: abis.PolicyRegistry,
      functionName: "attest",
      args: [bank, member, {tier: policy.tier, canDeposit: policy.canDeposit, canBorrow: policy.canBorrow, jurisdiction: policy.jurisdiction, expiry: BigInt(policy.expiry)}],
    }),
  );
  return true;
}

async function main() {
  console.log(`\n== Charter seed (chain ${chainId}) ==`);
  console.log(`factory=${dep.charterFactory}\n`);

  // 1. Steward charters a bank.
  console.log("1) Steward charters 'Brooklyn Mutual'…");
  const charterHash = await steward.client.writeContract({
    address: dep.charterFactory,
    abi: abis.CharterFactory,
    functionName: "charterBank",
    args: [
      "Brooklyn Mutual",
      "ipfs://brooklyn-mutual-brand",
      {checking: true, yield: true, credit: true},
      {
        globalDepositCap: toUsdc("5000000"),
        maxDepositPerMember: toUsdc("250000"),
        maxCreditPerBorrower: toUsdc("50000"),
        maxUtilizationBps: 6000,
        withdrawalDelay: 60, // 60s for a snappy demo
      },
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({hash: charterHash});
  // BankChartered(bank indexed, steward indexed, …) — bank is the first indexed topic.
  const log = receipt.logs.find((l) => l.address.toLowerCase() === dep.charterFactory.toLowerCase());
  // bank is the first indexed topic (address)
  const bank = (`0x${log!.topics[1]!.slice(26)}`) as Address;
  console.log(`   bank = ${bank}\n`);

  // 2. Onboard members through the compliance pipeline.
  console.log("2) Onboard members (compliance → on-chain attestation):");
  const alice = addr(ANVIL.alice);
  const bob = addr(ANVIL.bob);
  const carol = addr(ANVIL.carol);

  await attest(bank, alice, {fullName: "Alice Avery", country: "US", region: "NY", dateOfBirth: "1990-04-01", governmentIdHash: "id-hash-alice-0xabc123", sanctionsConsent: true, requestsCredit: false});
  await attest(bank, bob, {fullName: "Bob Brooks", country: "US", region: "NY", dateOfBirth: "1988-09-12", governmentIdHash: "id-hash-bob-0xdef456", sanctionsConsent: true, requestsCredit: true});
  // carol is from a sanctioned jurisdiction -> rejected, stays un-banked
  await attest(bank, carol, {fullName: "Carol Carr", country: "KP", dateOfBirth: "1992-01-01", sanctionsConsent: true, requestsCredit: false});
  console.log();

  // 3. Members register + deposit.
  console.log("3) Members register their Unlink pointer + deposit USDC:");
  for (const [pk, amount, unlink] of [
    [ANVIL.alice, toUsdc("120000"), "unlink1qalice…"],
    [ANVIL.bob, toUsdc("30000"), "unlink1qbob…"],
  ] as const) {
    const w = wallet(pk);
    await mintAndApprove(pk, amount, bank);
    await waitTx(await w.client.writeContract({address: bank, abi: abis.Bank, functionName: "registerMember", args: [unlink]}));
    await waitTx(await w.client.writeContract({address: bank, abi: abis.Bank, functionName: "deposit", args: [amount]}));
    console.log(`   ${w.account.address.slice(0, 8)}… deposited ${fromUsdc(amount)} USDC`);
  }
  console.log();

  // 4. Steward opens a credit line for bob; bob borrows.
  console.log("4) Steward extends credit; member borrows:");
  await waitTx(await steward.client.writeContract({address: bank, abi: abis.Bank, functionName: "openCreditLine", args: [bob, toUsdc("20000")]}));
  await waitTx(await wallet(ANVIL.bob).client.writeContract({address: bank, abi: abis.Bank, functionName: "borrow", args: [toUsdc("12000")]}));
  console.log(`   credit line 20,000 USDC → bob borrowed 12,000 USDC`);
  console.log();

  // 5. Steward routes idle reserve into the allow-listed yield vault.
  console.log("5) Steward routes idle reserve into the yield vault:");
  await waitTx(await steward.client.writeContract({address: bank, abi: abis.Bank, functionName: "allocateToStrategy", args: [dep.yieldVault, toUsdc("60000")]}));
  // simulate yield
  await waitTx(await steward.client.writeContract({address: dep.yieldVault, abi: abis.MockYieldVault, functionName: "accrue", args: [toUsdc("3000")]}));
  console.log(`   allocated 60,000 USDC; vault accrued +3,000 USDC yield`);
  console.log();

  // 6. Summary.
  const read = (fn: string, args: any[] = []) =>
    publicClient.readContract({address: bank, abi: abis.Bank, functionName: fn, args}) as Promise<bigint>;
  const [totalDeposits, totalDebt, idle, strat, total, util] = await Promise.all([
    read("totalDeposits"),
    read("totalDebt"),
    read("idleLiquidity"),
    read("strategyAssets"),
    read("totalAssets"),
    read("utilizationBps"),
  ]);

  console.log("== Bank summary ==");
  console.log(`  name:            Brooklyn Mutual`);
  console.log(`  address:         ${bank}`);
  console.log(`  totalDeposits:   ${fromUsdc(totalDeposits)} USDC`);
  console.log(`  totalDebt:       ${fromUsdc(totalDebt)} USDC`);
  console.log(`  idleLiquidity:   ${fromUsdc(idle)} USDC`);
  console.log(`  inStrategies:    ${fromUsdc(strat)} USDC`);
  console.log(`  totalAssets:     ${fromUsdc(total)} USDC`);
  console.log(`  utilization:     ${Number(util) / 100}%`);
  console.log(`\nSeed complete. Open the web app and connect as the steward (${steward.account.address}).`);
}

main().catch((e) => {
  console.error("seed failed:", e?.message ?? e);
  process.exit(1);
});
