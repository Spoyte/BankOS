// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {Ownable} from "solady/auth/Ownable.sol";

/// @title PrivacyPool
/// @notice A minimal shielded escrow that mirrors the on-chain footprint of the Unlink privacy layer.
///
///         - `deposit(commitment, amount)` pulls USDC into the commingled pool and records a note
///           commitment (a poseidon hash produced by the Unlink SDK). The depositor + amount are
///           visible (exactly as a real Unlink deposit is), but nothing links a deposit to a later
///           withdrawal.
///         - Internal transfers happen entirely *off-chain* in the Unlink engine (this contract never
///           sees them) — that is where balance + history privacy comes from.
///         - `withdraw(to, amount, nullifier)` is authorized by the engine **relayer**, which has
///           verified the spender's EdDSA-signed shielded balance off-chain. The nullifier prevents
///           double-spends.
///
///         In the live deployment this is the Unlink-operated pool reached through the Unlink SDK;
///         locally it is paired with our engine emulator so the full deposit -> private transfer ->
///         withdraw flow settles on-chain without a hosted engine.
contract PrivacyPool is ReentrancyGuard, Ownable {
    using SafeTransferLib for address;

    address public immutable asset;
    address public relayer; // the Unlink engine authorized to settle withdrawals

    mapping(bytes32 => bool) public commitmentSeen;
    mapping(bytes32 => bool) public nullifierSpent;
    uint256 public totalShielded; // aggregate pool balance (per-user amounts are NOT on-chain)

    event Deposited(bytes32 indexed commitment, address indexed from, uint256 amount);
    event Withdrawn(bytes32 indexed nullifier, address indexed to, uint256 amount);
    event RelayerSet(address indexed relayer);

    error OnlyRelayer();
    error CommitmentExists();
    error NullifierUsed();
    error InsufficientPool();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    constructor(address owner_, address asset_, address relayer_) {
        _initializeOwner(owner_);
        asset = asset_;
        relayer = relayer_;
        emit RelayerSet(relayer_);
    }

    function setRelayer(address relayer_) external onlyOwner {
        relayer = relayer_;
        emit RelayerSet(relayer_);
    }

    /// @notice Shield `amount` of USDC under `commitment` (a poseidon note hash from the Unlink SDK).
    function deposit(bytes32 commitment, uint256 amount) external nonReentrant {
        if (commitmentSeen[commitment]) revert CommitmentExists();
        commitmentSeen[commitment] = true;
        totalShielded += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(commitment, msg.sender, amount);
    }

    /// @notice Settle a withdrawal to `to`. Only the engine relayer may call this, after it has
    ///         verified the spender's shielded balance and EdDSA authorization off-chain.
    function withdraw(address to, uint256 amount, bytes32 nullifier) external nonReentrant onlyRelayer {
        if (nullifierSpent[nullifier]) revert NullifierUsed();
        if (amount > totalShielded) revert InsufficientPool();
        nullifierSpent[nullifier] = true;
        totalShielded -= amount;
        asset.safeTransfer(to, amount);
        emit Withdrawn(nullifier, to, amount);
    }
}
