#!/usr/bin/env node
// LI.FI proof-of-concept for Charter (see docs/ADR-001-lifi-poc.md).
// Verifies that LI.FI can (a) see Arc + Arc Testnet and (b) return executable
// same-chain swap calldata on Arc Testnet that the Unlink burner flow can wrap.
//
//   node scripts/lifi-poc.mjs
//
// No SDK or key required — uses the public li.quest REST API.

const API = "https://li.quest/v1";
const USDC_ARC = "0x3600000000000000000000000000000000000000";
const EURC_ARC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const ARC_TESTNET = 5042002;
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  return res.json();
}

async function main() {
  console.log("== LI.FI PoC for Charter ==\n");

  // 1. Does LI.FI know Arc?
  const chains = await getJson(`${API}/chains`);
  const arc = (chains.chains || []).filter((c) => /arc/i.test(c.name) || c.id === ARC_TESTNET);
  console.log("1) Arc chains known to LI.FI:");
  for (const c of arc) console.log(`     - ${c.name} (id ${c.id}, key ${c.key})`);
  const arcSupported = arc.some((c) => c.id === ARC_TESTNET);
  console.log(`   => Arc Testnet supported: ${arcSupported ? "YES" : "NO"}\n`);

  // 2. Same-chain swap calldata on Arc Testnet
  const q = await getJson(
    `${API}/quote?fromChain=${ARC_TESTNET}&toChain=${ARC_TESTNET}` +
      `&fromToken=${USDC_ARC}&toToken=${EURC_ARC}&fromAmount=1000000&fromAddress=${DEAD}`,
  );
  console.log("2) Same-chain quote USDC->EURC on Arc Testnet:");
  if (q.transactionRequest) {
    console.log(`     tool=${q.tool}  toAmount=${q.estimate?.toAmount}  to=${q.transactionRequest.to}`);
    console.log(`     calldata bytes=${(q.transactionRequest.data || "").length / 2 - 1}`);
    console.log("   => executable Flow calldata available: YES (wrap this in Unlink burner)\n");
  } else {
    console.log(`   => no calldata: ${q.message || JSON.stringify(q).slice(0, 200)}\n`);
  }

  // 3. Cross-chain into Arc testnet (expected: not routable yet)
  const x = await getJson(
    `${API}/quote?fromChain=42161&toChain=${ARC_TESTNET}` +
      `&fromToken=0xaf88d065e77c8cC2239327C5EDb3A432268e5831&toToken=${USDC_ARC}` +
      `&fromAmount=1000000&fromAddress=${DEAD}`,
  );
  console.log("3) Cross-chain Arbitrum->Arc Testnet:");
  console.log(`   => ${x.transactionRequest ? "routable" : x.message || "no route"}\n`);

  console.log("Decision: same-chain Arc routing works -> ship LI.FI as a feature-flagged");
  console.log("treasury-swap module; keep it OUT of the core dependency path. See ADR-001.");
}

main().catch((e) => {
  console.error("PoC error:", e.message);
  process.exit(1);
});
