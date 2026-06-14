import express from "express";
import cors from "cors";
import {z, ZodError} from "zod";
import type {Address} from "viem";
import {evaluateCompliance} from "./compliance.js";
import {Attester} from "./attester.js";
import {reviewTreasuryMove, agentEnabled, type AgentReviewInput} from "./treasuryAgent.js";

const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "invalid EVM address")
  .transform((v) => v as Address);
const kycSchema = z.object({
  fullName: z.string().min(1).max(120),
  country: z.string().min(2).max(8),
  region: z.string().max(16).optional(),
  dateOfBirth: z.string().min(4).max(32),
  governmentIdHash: z.string().max(200).optional(),
  sanctionsConsent: z.boolean(),
  requestsCredit: z.boolean().optional(),
});
const applySchema = z.object({bank: evmAddress, member: evmAddress, kyc: kycSchema});
const bankMemberSchema = z.object({bank: evmAddress, member: evmAddress});
const bankMemberParams = z.object({bank: evmAddress, member: evmAddress});

function badRequest(res: express.Response, e: unknown): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({error: "invalid request", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`)});
    return true;
  }
  return false;
}

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
    const {bank, member, kyc} = applySchema.parse(req.body);

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
    if (badRequest(res, e)) return;
    console.error("[apply] error", e?.message ?? e);
    return res.status(500).json({error: e?.message ?? "internal error"});
  }
});

app.get("/policy/:bank/:member", async (req, res) => {
  try {
    const {bank, member} = bankMemberParams.parse(req.params);
    const policy = await attester.getPolicy(bank as Address, member as Address);
    res.json({policy});
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(500).json({error: e?.message ?? "internal error"});
  }
});

// Claude-backed treasury-agent review (optional; falls back to deterministic if no API key).
app.get("/agent/status", (_req, res) => res.json({claudeBacked: agentEnabled()}));

app.post("/agent/treasury", async (req, res) => {
  try {
    const review = await reviewTreasuryMove(req.body as AgentReviewInput);
    if (!review) return res.json({claudeBacked: false, review: null});
    res.json({claudeBacked: true, review});
  } catch (e: any) {
    res.status(200).json({claudeBacked: false, review: null, error: e?.message});
  }
});

app.post("/revoke", async (req, res) => {
  try {
    const {bank, member} = bankMemberSchema.parse(req.body);
    const txHash = await attester.revoke(bank as Address, member as Address);
    res.json({revoked: true, txHash});
  } catch (e: any) {
    if (badRequest(res, e)) return;
    res.status(500).json({error: e?.message ?? "internal error"});
  }
});

// Railway/Render/Fly inject PORT; honor it first, then the app-specific override, then the local default.
const PORT = Number(process.env.PORT ?? process.env.POLICY_PORT ?? 4001);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`BankOS policy service (CRE DON simulator) on :${PORT}`);
  console.log(`  attester:       ${attester.account.address}`);
  console.log(`  policyRegistry: ${attester.registry}`);
});
