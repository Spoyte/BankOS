// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CharterFactory} from "../src/CharterFactory.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ExecutionRouter} from "../src/ExecutionRouter.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldVault} from "../src/mocks/MockYieldVault.sol";
import {IERC4626} from "../src/interfaces/IExternal.sol";

/// @notice Deploys the full Charter stack and writes addresses to deployments/<chainId>.json.
///
/// Env vars (all optional):
///   PRIVATE_KEY   - deployer key (defaults to anvil account #0 if unset)
///   ATTESTER      - the Chainlink CRE forwarder address authorized to write policy
///                   (defaults to anvil account #1)
///   USDC_ADDRESS  - existing USDC; if unset/zero a MockUSDC is deployed (use 0x3600... on Arc)
contract Deploy is Script {
    // anvil default accounts
    uint256 constant ANVIL_PK0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address constant ANVIL_ACCT1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", ANVIL_PK0);
        address deployer = vm.addr(pk);
        address attester = vm.envOr("ATTESTER", ANVIL_ACCT1);
        address usdcAddr = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(pk);

        if (usdcAddr == address(0)) {
            usdcAddr = address(new MockUSDC());
        }

        PolicyRegistry policy = new PolicyRegistry(deployer, attester);
        ExecutionRouter router = new ExecutionRouter(deployer);
        CharterFactory factory = new CharterFactory(deployer, usdcAddr, address(policy), address(router));

        // A vetted demo yield strategy, allow-listed for steward treasury routing.
        MockYieldVault vault = new MockYieldVault(usdcAddr);
        router.setAllowed(address(vault), IERC4626.deposit.selector, true);
        router.setAllowed(address(vault), IERC4626.redeem.selector, true);

        vm.stopBroadcast();

        console2.log("USDC            ", usdcAddr);
        console2.log("PolicyRegistry  ", address(policy));
        console2.log("ExecutionRouter ", address(router));
        console2.log("CharterFactory  ", address(factory));
        console2.log("BankImpl        ", factory.bankImplementation());
        console2.log("YieldVault      ", address(vault));
        console2.log("Attester        ", attester);

        _writeJson(usdcAddr, address(policy), address(router), address(factory), factory.bankImplementation(), address(vault), attester);
    }

    function _writeJson(
        address usdc,
        address policy,
        address router,
        address factory,
        address bankImpl,
        address vault,
        address attester
    ) internal {
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "usdc", usdc);
        vm.serializeAddress(o, "policyRegistry", policy);
        vm.serializeAddress(o, "executionRouter", router);
        vm.serializeAddress(o, "charterFactory", factory);
        vm.serializeAddress(o, "bankImplementation", bankImpl);
        vm.serializeAddress(o, "yieldVault", vault);
        string memory json = vm.serializeAddress(o, "attester", attester);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("wrote", path);
    }
}
