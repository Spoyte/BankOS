import {ARC_USDC_ERC20, ARC_EURC} from "@bankos/shared";
import type {Address} from "viem";

/**
 * LI.FI treasury routing — a feature-flagged stretch (see ADR-001). Fetches an executable same-chain
 * swap quote on Arc and returns its calldata for **preview only**. The calldata is shaped to be wrapped
 * by an Unlink burner (fundFromPool → swap → depositToPool) to rebalance idle reserve privately, but that
 * execution path is not wired here — this module previews the route, it does not execute it.
 * Disabled unless VITE_ENABLE_LIFI=true.
 */
export interface LifiQuote {
  tool: string;
  toAmount: string;
  to: Address;
  data: `0x${string}`;
}

export async function getArcTreasurySwapQuote(params: {
  fromAddress: Address;
  amount: bigint;
  fromToken?: Address;
  toToken?: Address;
}): Promise<LifiQuote | null> {
  const fromToken = params.fromToken ?? ARC_USDC_ERC20;
  const toToken = params.toToken ?? ARC_EURC;
  const url =
    `https://li.quest/v1/quote?fromChain=5042002&toChain=5042002` +
    `&fromToken=${fromToken}&toToken=${toToken}&fromAmount=${params.amount}&fromAddress=${params.fromAddress}`;
  try {
    const res = await fetch(url);
    const j = await res.json();
    if (!j.transactionRequest) return null;
    return {
      tool: j.tool,
      toAmount: j.estimate?.toAmount ?? "0",
      to: j.transactionRequest.to,
      data: j.transactionRequest.data,
    };
  } catch {
    return null;
  }
}
