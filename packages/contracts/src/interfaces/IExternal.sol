// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal ERC-20 surface used by Charter.
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @notice Minimal ERC-4626 surface for allow-listed yield strategies.
interface IERC4626 {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
    function balanceOf(address) external view returns (uint256);
}

interface IPolicyRegistry {
    function isEligibleToDeposit(address bank, address member) external view returns (bool);
    function isEligibleToBorrow(address bank, address member) external view returns (bool);
    function tierOf(address bank, address member) external view returns (uint8);
}

interface IExecutionRouter {
    function checkSelector(address target, bytes4 selector) external view;
    function checkAllowed(address target, bytes calldata data) external view;
}
