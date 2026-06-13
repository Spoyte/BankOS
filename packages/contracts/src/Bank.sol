// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {CharterTypes} from "./libraries/CharterTypes.sol";
import {IERC20, IERC4626, IPolicyRegistry, IExecutionRouter} from "./interfaces/IExternal.sol";

/// @title Bank
/// @notice A single, branded, self-custodial stablecoin bank chartered on Arc. Deployed as a
///         minimal-proxy clone by `CharterFactory` and configured by its steward.
///
///         Layered design:
///           - Public reserve / "checking": members deposit USDC; balances tracked transparently
///             here, while each member also links an Unlink shielded-account pointer so their
///             *private* checking balance and transfers live off the public ledger (Unlink layer).
///           - Policy gate: deposits and credit are gated by `PolicyRegistry`, whose state is
///             written by the Chainlink CRE confidential compliance workflow.
///           - Credit: policy-gated lines of credit a steward extends within strict risk caps.
///           - Treasury / yield: steward routes idle reserve into ERC-4626 strategies that are
///             pre-approved in `ExecutionRouter` (guard-railed, never arbitrary).
///
///         Principle: the steward decides *policy*, never *custody*. Members keep their own keys
///         (Dynamic embedded wallet) and their own Unlink spending key.
contract Bank is ReentrancyGuard {
    using SafeTransferLib for address;
    using CharterTypes for *;

    // ----------------------------------------------------------------- config / roles
    address public factory;
    address public steward;
    address public asset; // USDC (6 dp on Arc)
    IPolicyRegistry public policyRegistry;
    IExecutionRouter public executionRouter;

    string public name;
    string public brandURI; // logo / theme / metadata (e.g. ipfs://...)

    CharterTypes.Products public products;
    CharterTypes.RiskConfig public risk;
    bool public paused;
    bool private _initialized;

    // ----------------------------------------------------------------- accounting
    uint256 public totalDeposits; // member liabilities (public reserve path)
    uint256 public totalDebt; // outstanding drawn credit
    uint256 public totalPendingWithdraw; // claimed-but-not-yet-paid withdrawals (escrowed)

    mapping(address => uint256) public depositOf; // public deposit balance per member
    mapping(address => uint256) public creditLimitOf; // steward-granted credit ceiling
    mapping(address => uint256) public debtOf; // outstanding debt per member
    mapping(address => string) public unlinkAccountOf; // member's Unlink shielded-account pointer
    mapping(address => bool) public isMember;

    struct PendingWithdrawal {
        uint256 amount;
        uint64 unlockAt;
    }

    mapping(address => PendingWithdrawal) public pendingWithdrawalOf;

    // strategy tracking (treasury / yield)
    address[] public strategies;
    mapping(address => bool) private _isStrategy;
    mapping(address => uint256) public sharesOf; // bank's ERC-4626 shares per strategy

    // ----------------------------------------------------------------- events
    event Initialized(address indexed steward, string name, address asset);
    event ProductsConfigured(bool checking, bool yield, bool credit);
    event RiskConfigured(
        uint256 globalDepositCap,
        uint256 maxDepositPerMember,
        uint256 maxCreditPerBorrower,
        uint16 maxUtilizationBps,
        uint32 withdrawalDelay
    );
    event BrandUpdated(string brandURI);
    event StewardTransferred(address indexed from, address indexed to);
    event PausedSet(bool paused);

    event MemberRegistered(address indexed member, string unlinkAccount);
    event Deposited(address indexed member, uint256 amount, uint256 newBalance);
    event WithdrawalRequested(address indexed member, uint256 amount, uint64 unlockAt);
    event WithdrawalClaimed(address indexed member, uint256 amount);
    event WithdrawalCancelled(address indexed member, uint256 amount);

    event CreditLineOpened(address indexed member, uint256 limit);
    event Borrowed(address indexed member, uint256 amount, uint256 newDebt);
    event Repaid(address indexed member, uint256 amount, uint256 newDebt);

    event StrategyAllocated(address indexed strategy, uint256 assets, uint256 shares);
    event StrategyRedeemed(address indexed strategy, uint256 shares, uint256 assets);
    event PrivateNoteAnchored(address indexed member, bytes32 commitment);

    // ----------------------------------------------------------------- errors
    error AlreadyInitialized();
    error OnlySteward();
    error OnlyFactory();
    error BankPaused();
    error ProductDisabled();
    error NotEligible();
    error CapExceeded();
    error InsufficientBalance();
    error InsufficientLiquidity();
    error CreditLimitExceeded();
    error UtilizationExceeded();
    error NothingPending();
    error WithdrawalLocked();
    error ZeroAmount();

    modifier onlySteward() {
        if (msg.sender != steward) revert OnlySteward();
        _;
    }

    modifier notPaused() {
        if (paused) revert BankPaused();
        _;
    }

    // ----------------------------------------------------------------- init (clone)
    /// @notice One-time initializer called by the factory immediately after cloning.
    function initialize(
        address steward_,
        address asset_,
        address policyRegistry_,
        address executionRouter_,
        string calldata name_,
        string calldata brandURI_,
        CharterTypes.Products calldata products_,
        CharterTypes.RiskConfig calldata risk_
    ) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        factory = msg.sender;
        steward = steward_;
        asset = asset_;
        policyRegistry = IPolicyRegistry(policyRegistry_);
        executionRouter = IExecutionRouter(executionRouter_);
        name = name_;
        brandURI = brandURI_;
        products = products_;
        risk = risk_;
        emit Initialized(steward_, name_, asset_);
        emit ProductsConfigured(products_.checking, products_.yield, products_.credit);
        emit RiskConfigured(
            risk_.globalDepositCap,
            risk_.maxDepositPerMember,
            risk_.maxCreditPerBorrower,
            risk_.maxUtilizationBps,
            risk_.withdrawalDelay
        );
    }

    // ----------------------------------------------------------------- steward admin
    function configureProducts(CharterTypes.Products calldata p) external onlySteward {
        products = p;
        emit ProductsConfigured(p.checking, p.yield, p.credit);
    }

    function configureRisk(CharterTypes.RiskConfig calldata r) external onlySteward {
        risk = r;
        emit RiskConfigured(
            r.globalDepositCap, r.maxDepositPerMember, r.maxCreditPerBorrower, r.maxUtilizationBps, r.withdrawalDelay
        );
    }

    function setBrand(string calldata uri) external onlySteward {
        brandURI = uri;
        emit BrandUpdated(uri);
    }

    function transferSteward(address to) external onlySteward {
        require(to != address(0), "zero steward");
        emit StewardTransferred(steward, to);
        steward = to;
    }

    function setPaused(bool p) external onlySteward {
        paused = p;
        emit PausedSet(p);
    }

    // ----------------------------------------------------------------- membership
    /// @notice Link the caller's Unlink shielded-account pointer and join the bank. The pointer is
    ///         an `unlink1...` address; no balances are revealed on-chain by registering.
    function registerMember(string calldata unlinkAccount) external {
        isMember[msg.sender] = true;
        unlinkAccountOf[msg.sender] = unlinkAccount;
        emit MemberRegistered(msg.sender, unlinkAccount);
    }

    /// @notice Anchor a commitment hash for an off-ledger (Unlink) private deposit/transfer, so the
    ///         bank has an auditable pointer without exposing amounts. Optional, audit-only.
    function anchorPrivateNote(bytes32 commitment) external {
        emit PrivateNoteAnchored(msg.sender, commitment);
    }

    // ----------------------------------------------------------------- deposits / withdrawals
    function deposit(uint256 amount) external nonReentrant notPaused {
        if (amount == 0) revert ZeroAmount();
        if (!products.checking) revert ProductDisabled();
        if (!policyRegistry.isEligibleToDeposit(address(this), msg.sender)) revert NotEligible();

        uint256 newMemberBal = depositOf[msg.sender] + amount;
        if (risk.maxDepositPerMember != 0 && newMemberBal > risk.maxDepositPerMember) revert CapExceeded();
        uint256 newTotal = totalDeposits + amount;
        if (risk.globalDepositCap != 0 && newTotal > risk.globalDepositCap) revert CapExceeded();

        depositOf[msg.sender] = newMemberBal;
        totalDeposits = newTotal;
        isMember[msg.sender] = true;

        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, newMemberBal);
    }

    /// @notice Begin a withdrawal. Funds are escrowed and become claimable after `withdrawalDelay`.
    function requestWithdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (depositOf[msg.sender] < amount) revert InsufficientBalance();

        depositOf[msg.sender] -= amount;
        totalDeposits -= amount;

        PendingWithdrawal storage w = pendingWithdrawalOf[msg.sender];
        w.amount += amount;
        w.unlockAt = uint64(block.timestamp) + risk.withdrawalDelay;
        totalPendingWithdraw += amount;
        emit WithdrawalRequested(msg.sender, amount, w.unlockAt);
    }

    /// @notice Claim a matured withdrawal.
    function claimWithdraw() external nonReentrant {
        PendingWithdrawal storage w = pendingWithdrawalOf[msg.sender];
        uint256 amount = w.amount;
        if (amount == 0) revert NothingPending();
        if (block.timestamp < w.unlockAt) revert WithdrawalLocked();
        if (idleLiquidity() < amount) revert InsufficientLiquidity();

        w.amount = 0;
        w.unlockAt = 0;
        totalPendingWithdraw -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit WithdrawalClaimed(msg.sender, amount);
    }

    /// @notice Cancel a pending withdrawal and restore the deposit balance.
    function cancelWithdraw() external nonReentrant {
        PendingWithdrawal storage w = pendingWithdrawalOf[msg.sender];
        uint256 amount = w.amount;
        if (amount == 0) revert NothingPending();
        w.amount = 0;
        w.unlockAt = 0;
        totalPendingWithdraw -= amount;
        depositOf[msg.sender] += amount;
        totalDeposits += amount;
        emit WithdrawalCancelled(msg.sender, amount);
    }

    // ----------------------------------------------------------------- credit
    /// @notice Steward extends a credit line to a member, bounded by `maxCreditPerBorrower`.
    function openCreditLine(address member, uint256 limit) external onlySteward {
        if (!products.credit) revert ProductDisabled();
        if (risk.maxCreditPerBorrower != 0 && limit > risk.maxCreditPerBorrower) revert CapExceeded();
        creditLimitOf[member] = limit;
        emit CreditLineOpened(member, limit);
    }

    /// @notice Member draws on their line. Gated by policy + per-borrower limit + portfolio
    ///         utilization cap + available liquidity.
    function borrow(uint256 amount) external nonReentrant notPaused {
        if (amount == 0) revert ZeroAmount();
        if (!products.credit) revert ProductDisabled();
        if (!policyRegistry.isEligibleToBorrow(address(this), msg.sender)) revert NotEligible();

        uint256 newDebt = debtOf[msg.sender] + amount;
        if (newDebt > creditLimitOf[msg.sender]) revert CreditLimitExceeded();

        uint256 newTotalDebt = totalDebt + amount;
        // utilization = totalDebt / totalDeposits (loan-to-deposit ratio)
        if (risk.maxUtilizationBps != 0 && totalDeposits != 0) {
            if (newTotalDebt * 10_000 > uint256(risk.maxUtilizationBps) * totalDeposits) {
                revert UtilizationExceeded();
            }
        }
        if (idleLiquidity() < amount) revert InsufficientLiquidity();

        debtOf[msg.sender] = newDebt;
        totalDebt = newTotalDebt;
        asset.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount, newDebt);
    }

    /// @notice Repay outstanding debt (anyone may repay on a member's behalf).
    function repay(address member, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 d = debtOf[member];
        if (amount > d) amount = d; // cap to outstanding
        debtOf[member] = d - amount;
        totalDebt -= amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(member, amount, debtOf[member]);
    }

    // ----------------------------------------------------------------- treasury / yield
    /// @notice Route idle reserve into an allow-listed ERC-4626 strategy. The `vault` *and* the
    ///         `deposit` selector must be approved in `ExecutionRouter`, so the steward can only
    ///         ever reach vetted strategies.
    function allocateToStrategy(address vault, uint256 assets) external onlySteward nonReentrant notPaused {
        if (!products.yield) revert ProductDisabled();
        if (assets == 0) revert ZeroAmount();
        if (idleLiquidity() < assets) revert InsufficientLiquidity();
        executionRouter.checkSelector(vault, IERC4626.deposit.selector);

        asset.safeApprove(vault, assets);
        uint256 shares = IERC4626(vault).deposit(assets, address(this));
        sharesOf[vault] += shares;
        if (!_isStrategy[vault]) {
            _isStrategy[vault] = true;
            strategies.push(vault);
        }
        emit StrategyAllocated(vault, assets, shares);
    }

    /// @notice Redeem strategy shares back into reserve.
    function redeemFromStrategy(address vault, uint256 shares) external onlySteward nonReentrant {
        if (shares == 0) revert ZeroAmount();
        if (sharesOf[vault] < shares) revert InsufficientBalance();
        executionRouter.checkSelector(vault, IERC4626.redeem.selector);

        sharesOf[vault] -= shares;
        uint256 assets = IERC4626(vault).redeem(shares, address(this), address(this));
        emit StrategyRedeemed(vault, shares, assets);
    }

    // ----------------------------------------------------------------- views
    /// @notice USDC sitting idle in the bank (not in strategies).
    function idleLiquidity() public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    /// @notice Reserve currently deployed into yield strategies, valued at current share price.
    function strategyAssets() public view returns (uint256 total) {
        address[] memory s = strategies;
        for (uint256 i; i < s.length; ++i) {
            uint256 sh = sharesOf[s[i]];
            if (sh != 0) total += IERC4626(s[i]).convertToAssets(sh);
        }
    }

    /// @notice Total assets under the bank = idle + deployed.
    function totalAssets() external view returns (uint256) {
        return idleLiquidity() + strategyAssets();
    }

    /// @notice Loan-to-deposit ratio in bps.
    function utilizationBps() external view returns (uint256) {
        if (totalDeposits == 0) return 0;
        return (totalDebt * 10_000) / totalDeposits;
    }

    function availableCredit(address member) external view returns (uint256) {
        uint256 lim = creditLimitOf[member];
        uint256 d = debtOf[member];
        return lim > d ? lim - d : 0;
    }

    function strategyCount() external view returns (uint256) {
        return strategies.length;
    }
}
