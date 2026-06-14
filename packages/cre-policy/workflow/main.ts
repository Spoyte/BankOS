/**
 * BankOS compliance workflow — Chainlink CRE (production path).
 *
 * Trigger:        HTTP (a member submits a KYC application from the web app)
 * Confidential:   the raw KYC payload is sent to a compliance provider via **Confidential HTTP**,
 *                 executed inside the CRE secure enclave (TEE). Only the *decision* leaves the enclave.
 * On-chain write: a DON-signed report is delivered by the KeystoneForwarder to
 *                 `PolicyRegistry.onReport(metadata, report)`, where `report = abi.encode(bank, member,
 *                 Policy)`. This is the Chainlink-driven state change that gates every Charter bank.
 *
 * Run / simulate with the CRE CLI (see workflow/README.md):
 *   cre workflow simulate ./workflow --target staging-settings
 *
 * The decision logic is the SAME module the local DON simulator uses (`../src/compliance.ts`), so the
 * simulated/deployed workflow and the local demo are guaranteed to agree.
 */
import {
  Runner,
  handler,
  HTTPCapability,
  EVMClient,
  ConfidentialHTTPClient,
  prepareReportRequest,
  type Runtime,
} from "@chainlink/cre-sdk";
import {type Address, type Hex, encodeAbiParameters, encodeFunctionData, parseAbiParameters} from "viem";
import {evaluateCompliance, type KycPayload, type Policy} from "../src/compliance.js";

export interface Config {
  chainSelector: string; // CRE chain selector for Arc
  policyRegistry: Address; // PolicyRegistry (the onReport receiver)
  complianceApiUrl?: string; // optional confidential provider endpoint
}

const ON_REPORT_ABI = [
  {
    type: "function",
    name: "onReport",
    stateMutability: "nonpayable",
    inputs: [
      {name: "metadata", type: "bytes"},
      {name: "report", type: "bytes"},
    ],
    outputs: [],
  },
] as const;

const POLICY_TUPLE =
  "(uint8 tier, bool canDeposit, bool canBorrow, bytes32 jurisdiction, uint64 expiry)";

interface Application {
  bank: Address;
  member: Address;
  kyc: KycPayload;
}

/** Run the confidential eligibility check. Uses Confidential HTTP if a provider is configured,
 *  otherwise the in-enclave rules engine (identical to the local simulator). */
function screen(runtime: Runtime<Config>, app: Application): Policy {
  const cfg = runtime.config;
  if (cfg.complianceApiUrl) {
    // Raw PII is sent ONLY to the provider, inside the enclave; the response is the decision.
    const confidential = new ConfidentialHTTPClient();
    const res = confidential
      .sendRequest(runtime, {
        url: cfg.complianceApiUrl,
        method: "POST",
        headers: {"content-type": "application/json"},
        body: Buffer.from(JSON.stringify(app.kyc)).toString("base64"),
      })
      .result();
    const decoded = JSON.parse(Buffer.from(res.body ?? "", "base64").toString("utf8"));
    return decoded.policy as Policy;
  }
  return evaluateCompliance(app.kyc).policy;
}

export const onApplication = async (runtime: Runtime<Config>, req: {input: Uint8Array}): Promise<string> => {
  const app = JSON.parse(Buffer.from(req.input).toString("utf8")) as Application;
  const policy = screen(runtime, app);

  // report = abi.encode(bank, member, Policy)  — exactly what PolicyRegistry.onReport decodes.
  const innerReport: Hex = encodeAbiParameters(
    parseAbiParameters(`address, address, ${POLICY_TUPLE}`),
    [
      app.bank,
      app.member,
      {
        tier: policy.tier,
        canDeposit: policy.canDeposit,
        canBorrow: policy.canBorrow,
        jurisdiction: policy.jurisdiction,
        expiry: BigInt(policy.expiry),
      },
    ],
  );

  const payload = encodeFunctionData({
    abi: ON_REPORT_ABI,
    functionName: "onReport",
    args: ["0x", innerReport],
  });

  const evm = new EVMClient(runtime.config.chainSelector);
  const report = runtime.report(prepareReportRequest(payload)).result();
  const reply = evm
    .writeReport(runtime, {receiver: runtime.config.policyRegistry, report} as Parameters<EVMClient["writeReport"]>[1])
    .result();

  return `attested ${app.member} @ ${app.bank} (tier ${policy.tier})`;
};

export const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();
  return [handler(http.trigger({}), onApplication)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

// Only run under the CRE WASM host (mirrors the SDK's own conformance workflows).
if (typeof (globalThis as Record<string, unknown>).log === "function") {
  await main();
}
