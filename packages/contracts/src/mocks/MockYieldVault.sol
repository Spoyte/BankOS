// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "solady/tokens/ERC20.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @notice Minimal ERC-4626-style yield vault used as an allow-listed treasury strategy in demos.
///         Shares are 1:1 with assets at genesis; `accrue()` simulates yield by minting assets to
///         the vault, which lifts the share price so `convertToAssets` reflects gains.
contract MockYieldVault is ERC20 {
    using SafeTransferLib for address;

    address public immutable assetToken;

    constructor(address asset_) {
        assetToken = asset_;
    }

    function name() public pure override returns (string memory) {
        return "Charter Yield Vault";
    }

    function symbol() public pure override returns (string memory) {
        return "cyUSDC";
    }

    function asset() external view returns (address) {
        return assetToken;
    }

    function totalAssets() public view returns (uint256) {
        return ERC20(assetToken).balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 ta = totalAssets();
        return (supply == 0 || ta == 0) ? assets : (assets * supply) / ta;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets()) / supply;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        assetToken.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) _approve(owner, msg.sender, allowed - shares);
        }
        assets = convertToAssets(shares);
        _burn(owner, shares);
        assetToken.safeTransfer(receiver, assets);
    }

    /// @notice Simulate yield: mint `amount` assets into the vault (demo faucet).
    function accrue(uint256 amount) external {
        // requires the asset to expose mint(); MockUSDC does.
        (bool ok,) = assetToken.call(abi.encodeWithSignature("mint(address,uint256)", address(this), amount));
        require(ok, "accrue failed");
    }
}
