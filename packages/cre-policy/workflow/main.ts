/**
 * BankOS compliance workflow — CRE WASM entry point.
 *
 * Thin entry so the compiled WASM module exports only the parameterless `main`. All logic lives in
 * ./workflow (which the unit test imports). The `cre` CLI runs main() inside the WASM host.
 *
 * Run:  cre workflow simulate ./workflow --target staging-settings --allow-unknown-chains \
 *         --http-payload '{"bank":"0x..","member":"0x..","kyc":{...}}'
 */
import { Runner } from '@chainlink/cre-sdk'
import { configSchema, initWorkflow } from './workflow'

export async function main() {
	const runner = await Runner.newRunner({ configSchema })
	await runner.run(initWorkflow)
}

main()
