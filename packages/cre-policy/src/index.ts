import express from "express";
import cors from "cors";
import type {Address} from "viem";
import {evaluateCompliance, type KycPayload} from "./compliance.js";
import {Attester} from "./attester.js";

/**
 * Charter Policy Service — the local stand-in for the Chainlink CRE compliance DON.
 *
 * Flow (identical decision logic to workflow/main.ts):
 *   POST /apply { bank, member, kyc }
 *     1. run the confidential eligibility check (sanctions / jurisdiction / age / ID)
 *     2. if approved, land the resulting Policy on-chain via PolicyRegistry.attest()
 *     3. return the decision + tx hash
 *
 * Raw KYC never leaves this process and is never written on-chain; only the Policy decision is.
 */

const attester = new Attester();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "charter-policy",
    mode: "local-don-simulator",
    attester: attester.account.address,
    policyRegistry: attester.registry,
    chainId: attester.deployment.chainId,
  });
});

app.post("/apply", async (req, res) => {
  try {
    const {bank, member, kyc} = req.body as {bank: Address; member: Address; kyc: KycPayload};
    if (!bank || !member || !kyc) {
      return res.status(400).json({error: "bank, member and kyc are required"});
    }

    // 1. confidential compliance evaluation (PII stays in-process / in-enclave)
    const decision = evaluateCompliance(kyc);

    // never log or return raw PII — only the redacted subject + decision
    console.log(
      `[apply] bank=${bank} member=${member} country=${kyc.country} ` +
        `approved=${decision.approved} tier=${decision.policy.tier}`,
    );

    if (!decision.approved) {
      return res.json({approved: false, reasons: decision.reasons, txHash: null});
    }

    // 2. land the policy on-chain (the Chainlink-driven state change)
    const txHash = await attester.attest(bank, member, decision.policy);

    // 3. respond
    return res.json({
      approved: true,
      reasons: decision.reasons,
      policy: {...decision.policy, expiry: decision.policy.expiry},
      txHash,
    });
  } catch (e: any) {
    console.error("[apply] error", e?.message ?? e);
    return res.status(500).json({error: e?.message ?? "internal error"});
  }
});

app.get("/policy/:bank/:member", async (req, res) => {
  try {
    const policy = await attester.getPolicy(req.params.bank as Address, req.params.member as Address);
    res.json({policy});
  } catch (e: any) {
    res.status(500).json({error: e?.message ?? "internal error"});
  }
});

app.post("/revoke", async (req, res) => {
  try {
    const {bank, member} = req.body as {bank: Address; member: Address};
    const txHash = await attester.revoke(bank, member);
    res.json({revoked: true, txHash});
  } catch (e: any) {
    res.status(500).json({error: e?.message ?? "internal error"});
  }
});

const PORT = Number(process.env.POLICY_PORT ?? 4001);
app.listen(PORT, () => {
  console.log(`Charter policy service (CRE DON simulator) on http://127.0.0.1:${PORT}`);
  console.log(`  attester:       ${attester.account.address}`);
  console.log(`  policyRegistry: ${attester.registry}`);
});
