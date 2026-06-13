// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "solady/auth/Ownable.sol";
import {CharterTypes} from "./libraries/CharterTypes.sol";

/// @title PolicyRegistry
/// @notice On-chain home for compliance/eligibility *outputs* produced off-chain by the
///         Chainlink CRE confidential workflow. The workflow runs KYC / sanctions / jurisdiction
///         checks inside a TEE (Confidential HTTP), then a DON-authorized attester lands the
///         resulting `Policy` here. Banks read this registry to gate deposits and credit.
///
///         This is the contract that satisfies "a Chainlink service makes a state change on a
///         blockchain": `attest()` is only callable by an authorized attester (the CRE/Keystone
///         forwarder), and it mutates on-chain policy that the Bank contracts enforce.
///
///         Raw identity data NEVER touches the chain — only `tier`, eligibility booleans, a coarse
///         `jurisdiction` tag, and an `expiry`.
contract PolicyRegistry is Ownable {
    using CharterTypes for CharterTypes.Policy;

    /// @dev bank => member => policy
    mapping(address => mapping(address => CharterTypes.Policy)) private _policies;

    /// @dev addresses allowed to write attestations (CRE forwarder / DON).
    mapping(address => bool) public isAttester;

    event AttesterSet(address indexed attester, bool allowed);
    event PolicyAttested(
        address indexed bank,
        address indexed member,
        uint8 tier,
        bool canDeposit,
        bool canBorrow,
        bytes32 jurisdiction,
        uint64 expiry,
        address indexed attester
    );
    event PolicyRevoked(address indexed bank, address indexed member, address indexed attester);

    error NotAttester();
    error ExpiryInPast();

    modifier onlyAttester() {
        if (!isAttester[msg.sender]) revert NotAttester();
        _;
    }

    constructor(address owner_, address initialAttester) {
        _initializeOwner(owner_);
        if (initialAttester != address(0)) {
            isAttester[initialAttester] = true;
            emit AttesterSet(initialAttester, true);
        }
    }

    /// @notice Authorize / revoke an attester (the CRE forwarder address).
    function setAttester(address attester, bool allowed) external onlyOwner {
        isAttester[attester] = allowed;
        emit AttesterSet(attester, allowed);
    }

    /// @notice Land a compliance attestation for `member` at `bank`. Called by the CRE workflow's
    ///         forwarder after a successful confidential eligibility check.
    function attest(address bank, address member, CharterTypes.Policy calldata p) external onlyAttester {
        if (p.expiry != 0 && p.expiry <= block.timestamp) revert ExpiryInPast();
        _policies[bank][member] = p;
        emit PolicyAttested(bank, member, p.tier, p.canDeposit, p.canBorrow, p.jurisdiction, p.expiry, msg.sender);
    }

    /// @notice Batch attest — handy for the DON landing several members in one report.
    function attestBatch(
        address bank,
        address[] calldata members,
        CharterTypes.Policy[] calldata policies
    ) external onlyAttester {
        uint256 n = members.length;
        require(n == policies.length, "length mismatch");
        for (uint256 i; i < n; ++i) {
            CharterTypes.Policy calldata p = policies[i];
            if (p.expiry != 0 && p.expiry <= block.timestamp) revert ExpiryInPast();
            _policies[bank][members[i]] = p;
            emit PolicyAttested(
                bank, members[i], p.tier, p.canDeposit, p.canBorrow, p.jurisdiction, p.expiry, msg.sender
            );
        }
    }

    /// @notice Revoke a member's attestation (e.g. sanctions hit on re-screen).
    function revoke(address bank, address member) external onlyAttester {
        delete _policies[bank][member];
        emit PolicyRevoked(bank, member, msg.sender);
    }

    // --------------------------------------------------------------------- views

    function getPolicy(address bank, address member) external view returns (CharterTypes.Policy memory) {
        return _policies[bank][member];
    }

    function _valid(CharterTypes.Policy storage p) internal view returns (bool) {
        return p.expiry == 0 || p.expiry > block.timestamp;
    }

    function isEligibleToDeposit(address bank, address member) external view returns (bool) {
        CharterTypes.Policy storage p = _policies[bank][member];
        return p.canDeposit && _valid(p);
    }

    function isEligibleToBorrow(address bank, address member) external view returns (bool) {
        CharterTypes.Policy storage p = _policies[bank][member];
        return p.canBorrow && _valid(p);
    }

    /// @notice Cleared product band, or 0 if none / expired.
    function tierOf(address bank, address member) external view returns (uint8) {
        CharterTypes.Policy storage p = _policies[bank][member];
        return _valid(p) ? p.tier : 0;
    }
}
