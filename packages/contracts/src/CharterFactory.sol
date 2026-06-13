// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LibClone} from "solady/utils/LibClone.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {Bank} from "./Bank.sol";
import {CharterTypes} from "./libraries/CharterTypes.sol";

/// @title CharterFactory
/// @notice The "charter authority": anyone can charter a branded, private, compliant stablecoin
///         bank in one transaction. Deploys minimal-proxy clones of the `Bank` implementation and
///         wires them to the shared `PolicyRegistry` (Chainlink-attested compliance) and
///         `ExecutionRouter` (treasury allow-list). Each bank is self-custodial and steward-run.
contract CharterFactory is Ownable {
    address public immutable bankImplementation;
    address public asset; // USDC on Arc
    address public policyRegistry;
    address public executionRouter;

    address[] public allBanks;
    mapping(address => address[]) public banksOfSteward;
    mapping(address => bool) public isBank;

    event BankChartered(
        address indexed bank, address indexed steward, string name, string brandURI, uint256 index
    );
    event WiringUpdated(address asset, address policyRegistry, address executionRouter);

    constructor(
        address owner_,
        address asset_,
        address policyRegistry_,
        address executionRouter_
    ) {
        _initializeOwner(owner_);
        bankImplementation = address(new Bank());
        asset = asset_;
        policyRegistry = policyRegistry_;
        executionRouter = executionRouter_;
        emit WiringUpdated(asset_, policyRegistry_, executionRouter_);
    }

    /// @notice Update the shared wiring (owner-only). Existing banks keep their own references.
    function setWiring(address asset_, address policyRegistry_, address executionRouter_) external onlyOwner {
        asset = asset_;
        policyRegistry = policyRegistry_;
        executionRouter = executionRouter_;
        emit WiringUpdated(asset_, policyRegistry_, executionRouter_);
    }

    /// @notice Charter a new bank. `msg.sender` becomes the steward.
    function charterBank(
        string calldata name,
        string calldata brandURI,
        CharterTypes.Products calldata products,
        CharterTypes.RiskConfig calldata risk
    ) external returns (address bank) {
        bank = LibClone.clone(bankImplementation);
        Bank(bank).initialize(
            msg.sender, asset, policyRegistry, executionRouter, name, brandURI, products, risk
        );

        isBank[bank] = true;
        uint256 index = allBanks.length;
        allBanks.push(bank);
        banksOfSteward[msg.sender].push(bank);
        emit BankChartered(bank, msg.sender, name, brandURI, index);
    }

    function bankCount() external view returns (uint256) {
        return allBanks.length;
    }

    function getBanks() external view returns (address[] memory) {
        return allBanks;
    }

    function getBanksOfSteward(address steward) external view returns (address[] memory) {
        return banksOfSteward[steward];
    }
}
