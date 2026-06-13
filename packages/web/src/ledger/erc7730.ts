import {fromUsdc} from "@charter/shared";
import type {Address} from "viem";
import {CHAIN_ID} from "../config";

/** A human-readable "screen" a Ledger device shows for a transaction (Clear Signing / WYSIWYS). */
export interface ClearSignField {
  label: string;
  value: string;
}

export interface ClearSignView {
  contract: Address;
  functionName: string;
  intent: string; // the plain-English action
  fields: ClearSignField[];
  raw: unknown; // the ERC-7730 descriptor the device would consume
}

const SCHEMA = "https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json";

function descriptor(contract: Address, fn: string, intent: string, fields: ClearSignField[]) {
  return {
    $schema: SCHEMA,
    context: {contract: {deployments: [{chainId: CHAIN_ID, address: contract}]}},
    metadata: {owner: "Charter", info: {legalName: "Charter Bank Factory", url: "https://charter.example"}},
    display: {
      formats: {
        [fn]: {
          intent,
          fields: fields.map((f) => ({label: f.label, format: "raw", value: f.value})),
          required: fields.map((f) => f.label),
        },
      },
    },
  };
}

/** Build the Clear-Signing view for a steward action. These mirror the real on-chain calls that follow. */
export const clearSign = {
  pause(bank: Address, paused: boolean): ClearSignView {
    const fields = [
      {label: "Bank", value: bank},
      {label: "Action", value: paused ? "PAUSE all member operations" : "RESUME operations"},
    ];
    return {contract: bank, functionName: "setPaused(bool)", intent: paused ? "Emergency-pause this bank" : "Resume this bank", fields, raw: descriptor(bank, "setPaused(bool)", "Pause / resume bank", fields)};
  },
  allocate(bank: Address, vault: Address, amount: bigint): ClearSignView {
    const fields = [
      {label: "Bank", value: bank},
      {label: "Strategy vault", value: vault},
      {label: "Amount", value: `${fromUsdc(amount)} USDC`},
    ];
    return {contract: bank, functionName: "allocateToStrategy(address,uint256)", intent: "Move idle reserve into a yield strategy", fields, raw: descriptor(bank, "allocateToStrategy(address,uint256)", "Allocate reserve to strategy", fields)};
  },
  redeem(bank: Address, vault: Address, shares: bigint, assetsApprox: bigint): ClearSignView {
    const fields = [
      {label: "Bank", value: bank},
      {label: "Strategy vault", value: vault},
      {label: "Redeem (≈ assets)", value: `${fromUsdc(assetsApprox)} USDC`},
    ];
    return {contract: bank, functionName: "redeemFromStrategy(address,uint256)", intent: "Redeem reserve from a yield strategy", fields, raw: descriptor(bank, "redeemFromStrategy(address,uint256)", "Redeem from strategy", fields)};
  },
  openCredit(bank: Address, member: Address, limit: bigint): ClearSignView {
    const fields = [
      {label: "Bank", value: bank},
      {label: "Member", value: member},
      {label: "Credit limit", value: `${fromUsdc(limit)} USDC`},
    ];
    return {contract: bank, functionName: "openCreditLine(address,uint256)", intent: "Extend a credit line to a member", fields, raw: descriptor(bank, "openCreditLine(address,uint256)", "Open credit line", fields)};
  },
  configureRisk(bank: Address, r: {globalDepositCap: bigint; maxCreditPerBorrower: bigint; maxUtilizationBps: number}): ClearSignView {
    const fields = [
      {label: "Bank", value: bank},
      {label: "Global deposit cap", value: `${fromUsdc(r.globalDepositCap)} USDC`},
      {label: "Max credit / borrower", value: `${fromUsdc(r.maxCreditPerBorrower)} USDC`},
      {label: "Max utilization", value: `${r.maxUtilizationBps / 100}%`},
    ];
    return {contract: bank, functionName: "configureRisk(...)", intent: "Update bank risk limits", fields, raw: descriptor(bank, "configureRisk(...)", "Update risk limits", fields)};
  },
};
