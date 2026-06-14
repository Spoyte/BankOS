import { describe, expect } from 'bun:test'
import { newTestRuntime, test } from '@chainlink/cre-sdk/test'
import type { Runtime } from '@chainlink/cre-sdk'
import { decodeAbiParameters, parseAbiParameters } from 'viem'
import { onApplication, initWorkflow, encodeReport, type Application, type Config } from './workflow'

const config: Config = {
	chainSelector: '5042002',
	policyRegistry: '0xB2ab070Bc1aB3c2be8B1D3ABb122Fd55a489dAa5',
	gasLimit: '600000',
	evmWrite: false, // offline: exercise screening + report production, not the EVM delivery
}

const BANK = '0x1111111111111111111111111111111111111111' as const
const MEMBER = '0x2222222222222222222222222222222222222222' as const

const payloadFor = (app: Application) => ({ input: new TextEncoder().encode(JSON.stringify(app)) })

// Run the handler against a test runtime; return its result + logs (the test runtime is Runtime<unknown>).
const run = (app: Application) => {
	const runtime = newTestRuntime()
	runtime.config = config
	const result = onApplication(runtime as unknown as Runtime<Config>, payloadFor(app))
	return { result, logs: runtime.getLogs() }
}

const cleanApplicant: Application = {
	bank: BANK,
	member: MEMBER,
	kyc: {
		fullName: 'Alice Example',
		country: 'US',
		region: 'NY',
		dateOfBirth: '1990-01-01',
		governmentIdHash: '0xverifiedidhash1234567890',
		sanctionsConsent: true,
		requestsCredit: true,
	},
}

describe('compliance workflow (CRE)', () => {
	test('approves a clean credit-eligible applicant (tier 3)', () => {
		const { result, logs } = run(cleanApplicant)
		expect(result).toContain('approved=true')
		expect(result).toContain('tier 3')
		expect(logs.some((l) => l.includes('canBorrow=true'))).toBe(true)
	})

	test('rejects a sanctioned jurisdiction (tier 0, approved=false)', () => {
		const { result } = run({ ...cleanApplicant, kyc: { ...cleanApplicant.kyc, country: 'KP' } })
		expect(result).toContain('approved=false')
		expect(result).toContain('tier 0')
	})

	test('encodeReport produces bytes that PolicyRegistry.onReport can decode', () => {
		const policy = {
			tier: 2,
			canDeposit: true,
			canBorrow: false,
			jurisdiction: ('0x' + '0'.repeat(64)) as `0x${string}`,
			expiry: 1893456000,
		}
		const report = encodeReport(cleanApplicant, policy)
		const [bank, member, decoded] = decodeAbiParameters(
			parseAbiParameters(
				'address, address, (uint8 tier, bool canDeposit, bool canBorrow, bytes32 jurisdiction, uint64 expiry)',
			),
			report,
		)
		expect((bank as string).toLowerCase()).toBe(BANK)
		expect((member as string).toLowerCase()).toBe(MEMBER)
		expect((decoded as { tier: number }).tier).toBe(2)
		expect((decoded as { canDeposit: boolean }).canDeposit).toBe(true)
	})

	test('initWorkflow registers exactly one HTTP-triggered handler', () => {
		expect(initWorkflow(config)).toHaveLength(1)
	})
})
