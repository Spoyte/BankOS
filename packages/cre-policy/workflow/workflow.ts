/**
 * BankOS compliance workflow logic — Chainlink CRE (production path).
 *
 * Trigger:   HTTP — a member submits a KYC application (`cre workflow simulate ... --http-payload`).
 * Screening: runs the SAME compliance brain as the local DON simulator (`../src/compliance.ts`), so the
 *            simulated/deployed workflow and the local demo make identical decisions. In production the
 *            raw PII is screened inside the CRE enclave (Confidential HTTP); only the decision leaves.
 * On-chain:  produces a DON report = abi.encode(bank, member, Policy) and (when `evmWrite` is on)
 *            delivers it to `PolicyRegistry.onReport(metadata, report)` via the EVM capability — the
 *            Chainlink-driven state change that gates every BankOS bank.
 *
 * (Kept separate from main.ts so the WASM entry exports only the parameterless `main`; this module is
 *  what the unit test imports.)
 */
import {
	cre,
	prepareReportRequest,
	bytesToHex,
	TxStatus,
	type Runtime,
} from '@chainlink/cre-sdk'
import {
	encodeAbiParameters,
	encodeFunctionData,
	parseAbiParameters,
	type Address,
	type Hex,
} from 'viem'
import { z } from 'zod'
import { evaluateCompliance, type KycPayload, type Policy } from '../src/compliance.js'

export const configSchema = z.object({
	// Arc experimental chain selector (see project.yaml experimental-chains).
	chainSelector: z.string(),
	// PolicyRegistry (the onReport receiver) on Arc.
	policyRegistry: z.string(),
	gasLimit: z.string().default('600000'),
	// Deliver the report on-chain. Off for offline simulation; on for a real DON deploy.
	evmWrite: z.boolean().default(false),
})

export type Config = z.infer<typeof configSchema>

export interface Application {
	bank: Address
	member: Address
	kyc: KycPayload
}

const ON_REPORT_ABI = [
	{
		type: 'function',
		name: 'onReport',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'metadata', type: 'bytes' },
			{ name: 'report', type: 'bytes' },
		],
		outputs: [],
	},
] as const

const POLICY_TUPLE =
	'(uint8 tier, bool canDeposit, bool canBorrow, bytes32 jurisdiction, uint64 expiry)'

/** abi.encode(bank, member, Policy) — exactly the bytes `PolicyRegistry.onReport` decodes. */
export function encodeReport(app: Application, policy: Policy): Hex {
	return encodeAbiParameters(parseAbiParameters(`address, address, ${POLICY_TUPLE}`), [
		app.bank,
		app.member,
		{
			tier: policy.tier,
			canDeposit: policy.canDeposit,
			canBorrow: policy.canBorrow,
			jurisdiction: policy.jurisdiction,
			expiry: BigInt(policy.expiry),
		},
	])
}

export const onApplication = (runtime: Runtime<Config>, payload: { input: Uint8Array }): string => {
	const app = JSON.parse(Buffer.from(payload.input).toString('utf-8')) as Application
	runtime.log(`KYC application: member=${app.member} bank=${app.bank} country=${app.kyc.country}`)

	// Confidential screening (in production this runs in the CRE enclave). Same brain as the local DON.
	const { approved, reasons, policy } = evaluateCompliance(app.kyc)
	runtime.log(`Decision: approved=${approved} tier=${policy.tier} canBorrow=${policy.canBorrow}`)
	for (const r of reasons) runtime.log(`  reason: ${r}`)

	const report = encodeReport(app, policy)
	runtime.log(`Report (abi.encode bank,member,Policy): ${report}`)

	if (runtime.config.evmWrite) {
		const callData = encodeFunctionData({
			abi: ON_REPORT_ABI,
			functionName: 'onReport',
			args: ['0x', report],
		})
		const reportResponse = runtime.report(prepareReportRequest(callData)).result()
		const evmClient = new cre.capabilities.EVMClient(BigInt(runtime.config.chainSelector))
		const resp = evmClient
			.writeReport(runtime, {
				receiver: runtime.config.policyRegistry as Address,
				report: reportResponse,
				gasConfig: { gasLimit: runtime.config.gasLimit },
			})
			.result()
		if (resp.txStatus !== TxStatus.SUCCESS) {
			throw new Error(`writeReport failed: ${resp.errorMessage || resp.txStatus}`)
		}
		runtime.log(`Policy attested on-chain at tx ${bytesToHex(resp.txHash || new Uint8Array(32))}`)
	}

	return `screened ${app.member}: tier ${policy.tier}, approved=${approved}`
}

export function initWorkflow(config: Config) {
	const http = new cre.capabilities.HTTPCapability()
	return [cre.handler(http.trigger({}), onApplication)]
}
