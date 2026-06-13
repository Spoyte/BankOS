// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CharterFactory} from "../src/CharterFactory.sol";
import {Bank} from "../src/Bank.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ExecutionRouter} from "../src/ExecutionRouter.sol";
import {CharterTypes} from "../src/libraries/CharterTypes.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldVault} from "../src/mocks/MockYieldVault.sol";
import {IERC4626} from "../src/interfaces/IExternal.sol";

contract CharterTestBase is Test {
    CharterFactory factory;
    PolicyRegistry policy;
    ExecutionRouter router;
    MockUSDC usdc;
    MockYieldVault vault;

    address admin = makeAddr("admin");
    address attester = makeAddr("attester"); // stands in for the Chainlink CRE forwarder
    address steward = makeAddr("steward");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant USDC = 1e6;

    function setUp() public virtual {
        usdc = new MockUSDC();
        vm.startPrank(admin);
        policy = new PolicyRegistry(admin, attester);
        router = new ExecutionRouter(admin);
        factory = new CharterFactory(admin, address(usdc), address(policy), address(router));
        vm.stopPrank();

        vault = new MockYieldVault(address(usdc));
        // Allow the vault's deposit/redeem selectors for treasury routing.
        vm.startPrank(admin);
        router.setAllowed(address(vault), IERC4626.deposit.selector, true);
        router.setAllowed(address(vault), IERC4626.redeem.selector, true);
        vm.stopPrank();

        usdc.mint(alice, 1_000_000 * USDC);
        usdc.mint(bob, 1_000_000 * USDC);
    }

    function _defaultProducts() internal pure returns (CharterTypes.Products memory) {
        return CharterTypes.Products({checking: true, yield: true, credit: true});
    }

    function _defaultRisk() internal pure returns (CharterTypes.RiskConfig memory) {
        return CharterTypes.RiskConfig({
            globalDepositCap: 10_000_000 * USDC,
            maxDepositPerMember: 100_000 * USDC,
            maxCreditPerBorrower: 50_000 * USDC,
            maxUtilizationBps: 5000, // 50% loan-to-deposit
            withdrawalDelay: 1 days
        });
    }

    function _charter() internal returns (Bank bank) {
        vm.prank(steward);
        bank = Bank(
            factory.charterBank("Brooklyn Mutual", "ipfs://brand", _defaultProducts(), _defaultRisk())
        );
    }

    function _attestDeposit(address bank, address member, bool canDeposit, bool canBorrow) internal {
        vm.prank(attester);
        policy.attest(
            bank,
            member,
            CharterTypes.Policy({
                tier: 2,
                canDeposit: canDeposit,
                canBorrow: canBorrow,
                jurisdiction: keccak256("US-NY"),
                expiry: uint64(block.timestamp + 365 days)
            })
        );
    }
}

contract FactoryTest is CharterTestBase {
    function test_charterBank_registersAndWires() public {
        Bank bank = _charter();
        assertEq(factory.bankCount(), 1);
        assertTrue(factory.isBank(address(bank)));
        assertEq(bank.steward(), steward);
        assertEq(bank.asset(), address(usdc));
        assertEq(address(bank.policyRegistry()), address(policy));
        assertEq(bank.name(), "Brooklyn Mutual");
        (bool checking, bool yield, bool credit) = bank.products();
        assertTrue(checking && yield && credit);
        address[] memory mine = factory.getBanksOfSteward(steward);
        assertEq(mine.length, 1);
        assertEq(mine[0], address(bank));
    }

    function test_charter_cannotReinitialize() public {
        Bank bank = _charter();
        vm.expectRevert(Bank.AlreadyInitialized.selector);
        bank.initialize(
            steward, address(usdc), address(policy), address(router), "x", "x", _defaultProducts(), _defaultRisk()
        );
    }

    function test_multipleStewardsIndependentBanks() public {
        _charter();
        vm.prank(alice);
        factory.charterBank("Alice Bank", "", _defaultProducts(), _defaultRisk());
        assertEq(factory.bankCount(), 2);
        assertEq(factory.getBanksOfSteward(steward).length, 1);
        assertEq(factory.getBanksOfSteward(alice).length, 1);
    }
}

contract PolicyGateTest is CharterTestBase {
    function test_deposit_blockedWithoutPolicy() public {
        Bank bank = _charter();
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        vm.expectRevert(Bank.NotEligible.selector);
        bank.deposit(1000 * USDC);
        vm.stopPrank();
    }

    function test_deposit_allowedAfterAttestation() public {
        Bank bank = _charter();
        _attestDeposit(address(bank), alice, true, false);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        bank.deposit(1000 * USDC);
        vm.stopPrank();
        assertEq(bank.depositOf(alice), 1000 * USDC);
        assertEq(bank.totalDeposits(), 1000 * USDC);
        assertEq(bank.idleLiquidity(), 1000 * USDC);
    }

    function test_attest_onlyAttester() public {
        Bank bank = _charter();
        vm.expectRevert(PolicyRegistry.NotAttester.selector);
        vm.prank(alice);
        policy.attest(
            address(bank),
            alice,
            CharterTypes.Policy(1, true, false, bytes32(0), uint64(block.timestamp + 1 days))
        );
    }

    function test_expiredPolicy_blocksDeposit() public {
        Bank bank = _charter();
        vm.prank(attester);
        policy.attest(
            address(bank),
            alice,
            CharterTypes.Policy(1, true, false, bytes32(0), uint64(block.timestamp + 100))
        );
        vm.warp(block.timestamp + 101);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        vm.expectRevert(Bank.NotEligible.selector);
        bank.deposit(1 * USDC);
        vm.stopPrank();
    }

    function test_revoke_blocksFurtherDeposits() public {
        Bank bank = _charter();
        _attestDeposit(address(bank), alice, true, false);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        bank.deposit(10 * USDC);
        vm.stopPrank();
        vm.prank(attester);
        policy.revoke(address(bank), alice);
        vm.prank(alice);
        vm.expectRevert(Bank.NotEligible.selector);
        bank.deposit(10 * USDC);
    }
}

contract DepositCapsTest is CharterTestBase {
    function test_perMemberCap() public {
        Bank bank = _charter();
        _attestDeposit(address(bank), alice, true, false);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        vm.expectRevert(Bank.CapExceeded.selector);
        bank.deposit(100_001 * USDC); // cap is 100k
        bank.deposit(100_000 * USDC); // exactly at cap ok
        vm.stopPrank();
        assertEq(bank.depositOf(alice), 100_000 * USDC);
    }

    function test_globalCap() public {
        // tighten global cap to 150k
        Bank bank = _charter();
        CharterTypes.RiskConfig memory r = _defaultRisk();
        r.globalDepositCap = 150_000 * USDC;
        vm.prank(steward);
        bank.configureRisk(r);

        _attestDeposit(address(bank), alice, true, false);
        _attestDeposit(address(bank), bob, true, false);
        vm.prank(alice);
        usdc.approve(address(bank), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(bank), type(uint256).max);

        vm.prank(alice);
        bank.deposit(100_000 * USDC);
        vm.prank(bob);
        vm.expectRevert(Bank.CapExceeded.selector);
        bank.deposit(100_000 * USDC); // would push total to 200k > 150k
        vm.prank(bob);
        bank.deposit(50_000 * USDC);
        assertEq(bank.totalDeposits(), 150_000 * USDC);
    }
}

contract WithdrawalTest is CharterTestBase {
    Bank bank;

    function setUp() public override {
        super.setUp();
        bank = _charter();
        _attestDeposit(address(bank), alice, true, false);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        bank.deposit(1000 * USDC);
        vm.stopPrank();
    }

    function test_withdrawal_respectsDelay() public {
        vm.prank(alice);
        bank.requestWithdraw(400 * USDC);
        assertEq(bank.depositOf(alice), 600 * USDC);
        assertEq(bank.totalPendingWithdraw(), 400 * USDC);

        vm.prank(alice);
        vm.expectRevert(Bank.WithdrawalLocked.selector);
        bank.claimWithdraw();

        vm.warp(block.timestamp + 1 days);
        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        bank.claimWithdraw();
        assertEq(usdc.balanceOf(alice) - balBefore, 400 * USDC);
        assertEq(bank.totalPendingWithdraw(), 0);
    }

    function test_cancelWithdraw_restoresBalance() public {
        vm.prank(alice);
        bank.requestWithdraw(400 * USDC);
        vm.prank(alice);
        bank.cancelWithdraw();
        assertEq(bank.depositOf(alice), 1000 * USDC);
        assertEq(bank.totalPendingWithdraw(), 0);
    }

    function test_requestWithdraw_insufficientBalanceReverts() public {
        vm.prank(alice);
        vm.expectRevert(Bank.InsufficientBalance.selector);
        bank.requestWithdraw(2000 * USDC);
    }
}

contract CreditTest is CharterTestBase {
    Bank bank;

    function setUp() public override {
        super.setUp();
        bank = _charter();
        // alice deposits liquidity; bob is a borrower
        _attestDeposit(address(bank), alice, true, false);
        _attestDeposit(address(bank), bob, false, true);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        bank.deposit(100_000 * USDC);
        vm.stopPrank();
    }

    function test_borrow_requiresCreditLineAndPolicy() public {
        // no credit line yet
        vm.prank(bob);
        vm.expectRevert(Bank.CreditLimitExceeded.selector);
        bank.borrow(1 * USDC);

        vm.prank(steward);
        bank.openCreditLine(bob, 10_000 * USDC);

        vm.prank(bob);
        bank.borrow(5_000 * USDC);
        assertEq(bank.debtOf(bob), 5_000 * USDC);
        assertEq(usdc.balanceOf(bob), 1_000_000 * USDC + 5_000 * USDC);
        assertEq(bank.totalDebt(), 5_000 * USDC);
    }

    function test_borrow_blockedWithoutBorrowPolicy() public {
        vm.prank(steward);
        bank.openCreditLine(alice, 10_000 * USDC);
        vm.prank(alice); // alice only has canDeposit
        vm.expectRevert(Bank.NotEligible.selector);
        bank.borrow(1 * USDC);
    }

    function test_openCreditLine_capEnforced() public {
        vm.prank(steward);
        vm.expectRevert(Bank.CapExceeded.selector);
        bank.openCreditLine(bob, 50_001 * USDC); // cap is 50k
    }

    function test_utilizationCap() public {
        // deposits = 100k, maxUtil 50% => max debt 50k. Raise the per-borrower cap so the
        // *utilization* limit (not the credit-line cap) is the binding constraint.
        CharterTypes.RiskConfig memory r = _defaultRisk();
        r.maxCreditPerBorrower = 100_000 * USDC;
        vm.prank(steward);
        bank.configureRisk(r);

        vm.prank(steward);
        bank.openCreditLine(bob, 100_000 * USDC); // line high, util cap should bind
        vm.prank(bob);
        bank.borrow(50_000 * USDC);
        vm.prank(bob);
        vm.expectRevert(Bank.UtilizationExceeded.selector);
        bank.borrow(1 * USDC);
        assertEq(bank.utilizationBps(), 5000);
    }

    function test_repay_reducesDebt() public {
        vm.prank(steward);
        bank.openCreditLine(bob, 10_000 * USDC);
        vm.prank(bob);
        bank.borrow(5_000 * USDC);
        vm.startPrank(bob);
        usdc.approve(address(bank), type(uint256).max);
        bank.repay(bob, 2_000 * USDC);
        vm.stopPrank();
        assertEq(bank.debtOf(bob), 3_000 * USDC);
        assertEq(bank.totalDebt(), 3_000 * USDC);
    }

    function test_repay_capsToOutstanding() public {
        vm.prank(steward);
        bank.openCreditLine(bob, 10_000 * USDC);
        vm.prank(bob);
        bank.borrow(5_000 * USDC);
        vm.startPrank(bob);
        usdc.approve(address(bank), type(uint256).max);
        bank.repay(bob, 9_999 * USDC); // overpay capped to 5k
        vm.stopPrank();
        assertEq(bank.debtOf(bob), 0);
    }
}

contract TreasuryTest is CharterTestBase {
    Bank bank;

    function setUp() public override {
        super.setUp();
        bank = _charter();
        _attestDeposit(address(bank), alice, true, false);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        bank.deposit(100_000 * USDC);
        vm.stopPrank();
    }

    function test_allocateAndRedeem_throughRouter() public {
        vm.prank(steward);
        bank.allocateToStrategy(address(vault), 40_000 * USDC);
        assertEq(bank.idleLiquidity(), 60_000 * USDC);
        assertApproxEqAbs(bank.strategyAssets(), 40_000 * USDC, 1);
        assertApproxEqAbs(bank.totalAssets(), 100_000 * USDC, 1);
        assertEq(bank.strategyCount(), 1);

        uint256 shares = bank.sharesOf(address(vault));
        vm.prank(steward);
        bank.redeemFromStrategy(address(vault), shares);
        assertApproxEqAbs(bank.idleLiquidity(), 100_000 * USDC, 1);
    }

    function test_allocate_blockedWhenStrategyNotAllowlisted() public {
        MockYieldVault rogue = new MockYieldVault(address(usdc));
        vm.prank(steward);
        vm.expectRevert(); // ExecutionRouter.TargetNotAllowed
        bank.allocateToStrategy(address(rogue), 1_000 * USDC);
    }

    function test_yieldAccrual_liftsTotalAssets() public {
        vm.prank(steward);
        bank.allocateToStrategy(address(vault), 50_000 * USDC);
        // vault earns 10% on its holdings
        vault.accrue(5_000 * USDC);
        assertApproxEqAbs(bank.strategyAssets(), 55_000 * USDC, 1);
        assertApproxEqAbs(bank.totalAssets(), 105_000 * USDC, 1);
    }

    function test_allocate_onlySteward() public {
        vm.prank(alice);
        vm.expectRevert(Bank.OnlySteward.selector);
        bank.allocateToStrategy(address(vault), 1_000 * USDC);
    }

    function test_allocate_insufficientLiquidity() public {
        vm.prank(steward);
        vm.expectRevert(Bank.InsufficientLiquidity.selector);
        bank.allocateToStrategy(address(vault), 200_000 * USDC);
    }
}

contract PauseTest is CharterTestBase {
    function test_pause_blocksDeposits() public {
        Bank bank = _charter();
        _attestDeposit(address(bank), alice, true, false);
        vm.prank(steward);
        bank.setPaused(true);
        vm.startPrank(alice);
        usdc.approve(address(bank), type(uint256).max);
        vm.expectRevert(Bank.BankPaused.selector);
        bank.deposit(1 * USDC);
        vm.stopPrank();
    }

    function test_setPaused_onlySteward() public {
        Bank bank = _charter();
        vm.prank(alice);
        vm.expectRevert(Bank.OnlySteward.selector);
        bank.setPaused(true);
    }
}

contract MembershipTest is CharterTestBase {
    function test_registerMember_storesUnlinkPointer() public {
        Bank bank = _charter();
        vm.prank(alice);
        bank.registerMember("unlink1qalicepublicaccountpointer");
        assertTrue(bank.isMember(alice));
        assertEq(bank.unlinkAccountOf(alice), "unlink1qalicepublicaccountpointer");
    }

    function test_anchorPrivateNote_emits() public {
        Bank bank = _charter();
        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(bank));
        emit Bank.PrivateNoteAnchored(alice, keccak256("note"));
        bank.anchorPrivateNote(keccak256("note"));
    }
}
