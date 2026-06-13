// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "solady/tokens/ERC20.sol";

/// @notice 6-decimal mock USDC for local/Arc-testnet demos. On real Arc, the canonical USDC ERC-20
///         interface lives at 0x3600...0000; swap the address in deployment config to use it.
contract MockUSDC is ERC20 {
    function name() public pure override returns (string memory) {
        return "USD Coin (Mock)";
    }

    function symbol() public pure override returns (string memory) {
        return "USDC";
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open faucet for demos.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
