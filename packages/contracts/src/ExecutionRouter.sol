// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "solady/auth/Ownable.sol";

/// @title ExecutionRouter
/// @notice A thin, protocol-level allow-list that constrains which external `(target, selector)`
///         pairs a bank steward may invoke when routing idle reserve into yield/treasury actions.
///
///         This mirrors the spirit of Unlink's `execute()` guard-rails: the steward's *allocation
///         logic* is bounded by code and a whitelist, while the actual balances/flows can remain
///         private at the Unlink layer. The Bank consults `checkAllowed()` before performing any
///         low-level call with reserve funds, so a compromised or malicious steward can only ever
///         reach pre-approved strategies (e.g. a vetted ERC-4626 vault), never arbitrary contracts.
contract ExecutionRouter is Ownable {
    /// @dev keccak256(target, selector) => allowed
    mapping(bytes32 => bool) public allowed;

    event TargetAllowed(address indexed target, bytes4 indexed selector, bool allowed);

    error TargetNotAllowed(address target, bytes4 selector);
    error EmptyCalldata();

    constructor(address owner_) {
        _initializeOwner(owner_);
    }

    function _key(address target, bytes4 selector) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(target, selector));
    }

    /// @notice Allow/deny a `(target, selector)` pair for steward execution.
    function setAllowed(address target, bytes4 selector, bool ok) external onlyOwner {
        allowed[_key(target, selector)] = ok;
        emit TargetAllowed(target, selector, ok);
    }

    /// @notice Convenience batch setter for a target's selectors.
    function setAllowedBatch(address target, bytes4[] calldata selectors, bool ok) external onlyOwner {
        for (uint256 i; i < selectors.length; ++i) {
            allowed[_key(target, selectors[i])] = ok;
            emit TargetAllowed(target, selectors[i], ok);
        }
    }

    /// @notice True if `target` may be called with the selector encoded in `data`.
    function isAllowed(address target, bytes calldata data) public view returns (bool) {
        if (data.length < 4) return false;
        return allowed[_key(target, bytes4(data[0:4]))];
    }

    /// @notice Revert unless `target`/`data` is on the allow-list. Banks call this as a guard.
    function checkAllowed(address target, bytes calldata data) external view {
        if (data.length < 4) revert EmptyCalldata();
        bytes4 selector = bytes4(data[0:4]);
        if (!allowed[_key(target, selector)]) revert TargetNotAllowed(target, selector);
    }

    /// @notice Revert unless `(target, selector)` is allow-listed. Used by Bank's typed strategy calls.
    function checkSelector(address target, bytes4 selector) external view {
        if (!allowed[_key(target, selector)]) revert TargetNotAllowed(target, selector);
    }
}
