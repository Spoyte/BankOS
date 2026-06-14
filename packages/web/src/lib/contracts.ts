import type {Address, Hex, PublicClient, WalletClient} from "viem";
import {abis} from "@bankos/shared/abis";
import type {Products, RiskConfig} from "@bankos/shared";
import {deployment} from "../config";
import {publicClient} from "../wallet/WalletContext";

const factory = deployment.charterFactory;
const usdc = deployment.usdc;
const registry = deployment.policyRegistry;

const read = (address: Address, abi: any, fn: string, args: any[] = []) =>
  publicClient.readContract({address, abi, functionName: fn, args});

async function send(wc: WalletClient, address: Address, abi: any, fn: string, args: any[]): Promise<Hex> {
  const hash = await wc.writeContract({
    account: wc.account!,
    chain: wc.chain,
    address,
    abi,
    functionName: fn,
    args,
  });
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

// ------------------------------------------------------------------ reads
export async function listBanks(): Promise<Address[]> {
  return (await read(factory, abis.CharterFactory, "getBanks")) as Address[];
}

export async function banksOfSteward(steward: Address): Promise<Address[]> {
  return (await read(factory, abis.CharterFactory, "getBanksOfSteward", [steward])) as Address[];
}

export interface BankInfo {
  address: Address;
  name: string;
  brandURI: string;
  steward: Address;
  paused: boolean;
  products: Products;
  risk: RiskConfig;
  totalDeposits: bigint;
  totalDebt: bigint;
  idleLiquidity: bigint;
  strategyAssets: bigint;
  totalAssets: bigint;
  utilizationBps: bigint;
  totalPendingWithdraw: bigint;
}

function asProducts(t: any): Products {
  return {checking: !!(t.checking ?? t[0]), yield: !!(t.yield ?? t[1]), credit: !!(t.credit ?? t[2])};
}
function asRisk(t: any): RiskConfig {
  return {
    globalDepositCap: BigInt(t.globalDepositCap ?? t[0]),
    maxDepositPerMember: BigInt(t.maxDepositPerMember ?? t[1]),
    maxCreditPerBorrower: BigInt(t.maxCreditPerBorrower ?? t[2]),
    maxUtilizationBps: Number(t.maxUtilizationBps ?? t[3]),
    withdrawalDelay: Number(t.withdrawalDelay ?? t[4]),
  };
}

export async function getBankInfo(bank: Address): Promise<BankInfo> {
  const B = abis.Bank;
  const [name, brandURI, steward, paused, products, risk, totalDeposits, totalDebt, idle, strat, total, util, pending] =
    await Promise.all([
      read(bank, B, "name"),
      read(bank, B, "brandURI"),
      read(bank, B, "steward"),
      read(bank, B, "paused"),
      read(bank, B, "products"),
      read(bank, B, "risk"),
      read(bank, B, "totalDeposits"),
      read(bank, B, "totalDebt"),
      read(bank, B, "idleLiquidity"),
      read(bank, B, "strategyAssets"),
      read(bank, B, "totalAssets"),
      read(bank, B, "utilizationBps"),
      read(bank, B, "totalPendingWithdraw"),
    ]);
  return {
    address: bank,
    name: name as string,
    brandURI: brandURI as string,
    steward: steward as Address,
    paused: paused as boolean,
    products: asProducts(products),
    risk: asRisk(risk),
    totalDeposits: totalDeposits as bigint,
    totalDebt: totalDebt as bigint,
    idleLiquidity: idle as bigint,
    strategyAssets: strat as bigint,
    totalAssets: total as bigint,
    utilizationBps: util as bigint,
    totalPendingWithdraw: pending as bigint,
  };
}

export interface MemberInfo {
  isMember: boolean;
  deposit: bigint;
  debt: bigint;
  creditLimit: bigint;
  availableCredit: bigint;
  unlinkAccount: string;
  pendingAmount: bigint;
  pendingUnlockAt: number;
}

export async function getMemberInfo(bank: Address, member: Address): Promise<MemberInfo> {
  const B = abis.Bank;
  const [isMember, deposit, debt, creditLimit, available, unlinkAccount, pending] = await Promise.all([
    read(bank, B, "isMember", [member]),
    read(bank, B, "depositOf", [member]),
    read(bank, B, "debtOf", [member]),
    read(bank, B, "creditLimitOf", [member]),
    read(bank, B, "availableCredit", [member]),
    read(bank, B, "unlinkAccountOf", [member]),
    read(bank, B, "pendingWithdrawalOf", [member]),
  ]);
  const p = pending as any;
  return {
    isMember: isMember as boolean,
    deposit: deposit as bigint,
    debt: debt as bigint,
    creditLimit: creditLimit as bigint,
    availableCredit: available as bigint,
    unlinkAccount: unlinkAccount as string,
    pendingAmount: BigInt(p.amount ?? p[0]),
    pendingUnlockAt: Number(p.unlockAt ?? p[1]),
  };
}

export async function getPolicy(bank: Address, member: Address) {
  const p = (await read(registry, abis.PolicyRegistry, "getPolicy", [bank, member])) as any;
  return {
    tier: Number(p.tier ?? p[0]),
    canDeposit: !!(p.canDeposit ?? p[1]),
    canBorrow: !!(p.canBorrow ?? p[2]),
    jurisdiction: (p.jurisdiction ?? p[3]) as Hex,
    expiry: Number(p.expiry ?? p[4]),
  };
}

export async function usdcBalance(addr: Address): Promise<bigint> {
  return (await read(usdc, abis.MockUSDC, "balanceOf", [addr])) as bigint;
}

export async function strategyShares(bank: Address, vault: Address): Promise<bigint> {
  return (await read(bank, abis.Bank, "sharesOf", [vault])) as bigint;
}

export async function savingsClaimable(bank: Address, member: Address): Promise<bigint> {
  return (await read(bank, abis.Bank, "savingsClaimable", [member])) as bigint;
}
export async function stewardFees(bank: Address): Promise<bigint> {
  return (await read(bank, abis.Bank, "stewardFeesAccrued")) as bigint;
}
export async function stewardSpreadBps(bank: Address): Promise<number> {
  return Number(await read(bank, abis.Bank, "stewardSpreadBps"));
}

// ------------------------------------------------------------------ writes
export const charterBank = (wc: WalletClient, p: {name: string; brandURI: string; products: Products; risk: RiskConfig}) =>
  send(wc, factory, abis.CharterFactory, "charterBank", [
    p.name,
    p.brandURI,
    {checking: p.products.checking, yield: p.products.yield, credit: p.products.credit},
    {
      globalDepositCap: p.risk.globalDepositCap,
      maxDepositPerMember: p.risk.maxDepositPerMember,
      maxCreditPerBorrower: p.risk.maxCreditPerBorrower,
      maxUtilizationBps: p.risk.maxUtilizationBps,
      withdrawalDelay: p.risk.withdrawalDelay,
    },
  ]);

export const registerMember = (wc: WalletClient, bank: Address, unlinkAccount: string) =>
  send(wc, bank, abis.Bank, "registerMember", [unlinkAccount]);
export const depositToBank = (wc: WalletClient, bank: Address, amount: bigint) =>
  send(wc, bank, abis.Bank, "deposit", [amount]);
export const approveUsdc = (wc: WalletClient, spender: Address, amount: bigint) =>
  send(wc, usdc, abis.MockUSDC, "approve", [spender, amount]);
export const mintUsdc = (wc: WalletClient, to: Address, amount: bigint) =>
  send(wc, usdc, abis.MockUSDC, "mint", [to, amount]);
export const requestWithdraw = (wc: WalletClient, bank: Address, amount: bigint) =>
  send(wc, bank, abis.Bank, "requestWithdraw", [amount]);
export const claimWithdraw = (wc: WalletClient, bank: Address) =>
  send(wc, bank, abis.Bank, "claimWithdraw", []);
export const cancelWithdraw = (wc: WalletClient, bank: Address) =>
  send(wc, bank, abis.Bank, "cancelWithdraw", []);
export const openCreditLine = (wc: WalletClient, bank: Address, member: Address, limit: bigint) =>
  send(wc, bank, abis.Bank, "openCreditLine", [member, limit]);
export const borrow = (wc: WalletClient, bank: Address, amount: bigint) =>
  send(wc, bank, abis.Bank, "borrow", [amount]);
export const repay = (wc: WalletClient, bank: Address, member: Address, amount: bigint) =>
  send(wc, bank, abis.Bank, "repay", [member, amount]);
export const allocateToStrategy = (wc: WalletClient, bank: Address, vault: Address, amount: bigint) =>
  send(wc, bank, abis.Bank, "allocateToStrategy", [vault, amount]);
export const redeemFromStrategy = (wc: WalletClient, bank: Address, vault: Address, shares: bigint) =>
  send(wc, bank, abis.Bank, "redeemFromStrategy", [vault, shares]);
export const harvestYield = (wc: WalletClient, bank: Address, vault: Address) =>
  send(wc, bank, abis.Bank, "harvestYield", [vault]);
export const setStewardSpread = (wc: WalletClient, bank: Address, bps: number) =>
  send(wc, bank, abis.Bank, "setStewardSpread", [bps]);
export const claimSavings = (wc: WalletClient, bank: Address) =>
  send(wc, bank, abis.Bank, "claimSavings", []);
export const claimStewardFees = (wc: WalletClient, bank: Address) =>
  send(wc, bank, abis.Bank, "claimStewardFees", []);
export const setPaused = (wc: WalletClient, bank: Address, paused: boolean) =>
  send(wc, bank, abis.Bank, "setPaused", [paused]);
export const configureProducts = (wc: WalletClient, bank: Address, p: Products) =>
  send(wc, bank, abis.Bank, "configureProducts", [{checking: p.checking, yield: p.yield, credit: p.credit}]);
export const configureRisk = (wc: WalletClient, bank: Address, risk: RiskConfig) =>
  send(wc, bank, abis.Bank, "configureRisk", [
    {
      globalDepositCap: risk.globalDepositCap,
      maxDepositPerMember: risk.maxDepositPerMember,
      maxCreditPerBorrower: risk.maxCreditPerBorrower,
      maxUtilizationBps: risk.maxUtilizationBps,
      withdrawalDelay: risk.withdrawalDelay,
    },
  ]);

export {factory as factoryAddress, usdc as usdcAddress, registry as registryAddress};
