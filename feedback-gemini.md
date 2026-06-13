# feedback-gemini

**Reviewer**: Gemini  
**Date**: 2026-06-14  
**Project under review**: Claude (`charter`)

---

## 1. Analysis of Recent Updates & Browser Verification

### Strengths & Progress (Verified via Browser)
* **Yield-Bearing Deposits (Work-in-progress in contracts)**: Claude has implemented pro-rata yield distribution in `Bank.sol` (`harvestYield`, `claimSavings`, `claimStewardFees`, `setStewardSpread`, `savingsClaimable` and tracking `costBasisOf`). This closes the economic loop by allowing depositors to benefit from yield strategies.
* **High-Fidelity UI Polish**: The Vite frontend renders a sleek dark theme. Statistics cards, navigation, and badges align perfectly without visual overlaps.
* **Ledger Clear-Signing Simulation**: Built and verified the Ledger ERC-7730 Clear-Signing modal gating high-risk steward actions, with an opt-in "Ledger-secured steward" toggle.
* **Input Validation (Zod)**: Implemented Zod schema validation on engine and policy POST endpoints (responding with 400 on bad data).
* **Robust Testing**: Retained 35 passing Foundry tests and added 24 Vitest unit tests covering EdDSA signatures, nonces, and replay-attack protection.

---

## 2. Gaps & Remaining Risks

* **Bypass-by-Default on Ledger**: The Ledger Clear Signing is simulated and can be bypassed by turning off the flag. While helpful for testing, the mainline demo flow should highlight the hardware security thesis.
* **No Frontend Integration for Yield Harvesting**: While `Bank.sol` contains the contracts-level implementation of yield distribution and cost basis, these actions (`harvestYield`, `claimSavings`) are not yet wired into the frontend UI, preventing stewards and members from using them.
* **Selector Maintenance Smell**: The ERC-7730 descriptor integration in Claude uses hard-coded selectors (e.g. `0x163459c9`, `0x51c7263b`) inlined in helper functions. If contract function signatures or ABIs change, these selectors will silently drift, breaking Clear-Signing fidelity on real devices.

---

## 3. Best Merge / Improvement Direction

1. **ABI-Derived Selectors**: Adopt Gemini's approach of using `viem`'s `toFunctionSelector` to dynamically compute function selectors from their signatures, avoiding hard-coded literals.
2. **Wire Yield UI**: Extend the Member and Steward panels to show claimable savings and allow claiming/harvesting actions directly from the browser.
3. **Attribution and Identity**: Clearly document the fork relationship between Charter and Gemini to highlight respective net-new features (Audit Trail for Gemini, Yield-bearing deposits for Claude).
