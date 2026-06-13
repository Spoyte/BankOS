// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title CharterTypes
/// @notice Shared structs for the Charter bank-factory protocol.
library CharterTypes {
    /// @notice Which product modules a chartered bank offers.
    struct Products {
        bool checking; // private checking (deposits / private balances)
        bool yield; // steward can route idle reserve into allow-listed yield strategies
        bool credit; // policy-gated private lines of credit
    }

    /// @notice Risk guard-rails for a bank. All caps are in `asset` base units (USDC = 6 dp).
    ///         This is the on-chain "RiskConfig module" from the architecture: utilization caps,
    ///         withdrawal delays, per-borrower limits, and an emergency pause.
    struct RiskConfig {
        uint256 globalDepositCap; // max total public reserve the bank will hold (0 = unlimited)
        uint256 maxDepositPerMember; // per-member public deposit cap (0 = unlimited)
        uint256 maxCreditPerBorrower; // per-borrower credit-line ceiling
        uint16 maxUtilizationBps; // max (outstanding debt / reserve) in bps, e.g. 5000 = 50%
        uint32 withdrawalDelay; // seconds a withdrawal must mature before it can be claimed
    }

    /// @notice Compliance/eligibility attestation written by the Chainlink CRE workflow.
    ///         Only policy *outputs* live on-chain — never raw PII.
    struct Policy {
        uint8 tier; // product band the member is cleared for (0 = none, 1..n = ascending)
        bool canDeposit;
        bool canBorrow;
        bytes32 jurisdiction; // coarse jurisdiction tag (e.g. keccak256("US-NY"))
        uint64 expiry; // unix ts after which the attestation is stale
    }
}
