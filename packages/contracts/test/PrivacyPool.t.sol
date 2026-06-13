// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PrivacyPool} from "../src/PrivacyPool.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract PrivacyPoolTest is Test {
    PrivacyPool pool;
    MockUSDC usdc;
    address owner = makeAddr("owner");
    address engine = makeAddr("engine"); // relayer
    address alice = makeAddr("alice");
    address bobRecipient = makeAddr("bobRecipient");

    uint256 constant USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        pool = new PrivacyPool(owner, address(usdc), engine);
        usdc.mint(alice, 100_000 * USDC);
    }

    function test_deposit_recordsCommitmentAndPools() public {
        bytes32 commitment = keccak256("note-1");
        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(commitment, 10_000 * USDC);
        vm.stopPrank();
        assertTrue(pool.commitmentSeen(commitment));
        assertEq(pool.totalShielded(), 10_000 * USDC);
        assertEq(usdc.balanceOf(address(pool)), 10_000 * USDC);
    }

    function test_deposit_rejectsDuplicateCommitment() public {
        bytes32 c = keccak256("note");
        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(c, 1 * USDC);
        vm.expectRevert(PrivacyPool.CommitmentExists.selector);
        pool.deposit(c, 1 * USDC);
        vm.stopPrank();
    }

    function test_withdraw_onlyRelayer_settlesToFreshAddress() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(keccak256("n"), 10_000 * USDC);
        vm.stopPrank();

        // a random caller cannot settle
        vm.prank(alice);
        vm.expectRevert(PrivacyPool.OnlyRelayer.selector);
        pool.withdraw(bobRecipient, 1 * USDC, keccak256("null-1"));

        // the engine relayer settles a withdrawal to an unlinked recipient
        vm.prank(engine);
        pool.withdraw(bobRecipient, 4_000 * USDC, keccak256("null-1"));
        assertEq(usdc.balanceOf(bobRecipient), 4_000 * USDC);
        assertEq(pool.totalShielded(), 6_000 * USDC);
    }

    function test_withdraw_rejectsReusedNullifier() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(keccak256("n"), 10_000 * USDC);
        vm.stopPrank();
        vm.startPrank(engine);
        pool.withdraw(bobRecipient, 1_000 * USDC, keccak256("x"));
        vm.expectRevert(PrivacyPool.NullifierUsed.selector);
        pool.withdraw(bobRecipient, 1_000 * USDC, keccak256("x"));
        vm.stopPrank();
    }

    function test_setRelayer_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.setRelayer(alice);
        vm.prank(owner);
        pool.setRelayer(alice);
        assertEq(pool.relayer(), alice);
    }
}
