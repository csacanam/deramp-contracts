// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IDerampStorage.sol";
import "./interfaces/IAccessManager.sol";
import "./interfaces/IInvoiceManager.sol";
import "./interfaces/IPaymentProcessor.sol";
import "./interfaces/IWithdrawalManager.sol";
import "./interfaces/ITreasuryManager.sol";

contract DerampProxy is Ownable, Pausable, ReentrancyGuard {
    // Module contracts
    address public storageContract;
    address public accessManager;
    address public invoiceManager;
    address public paymentProcessor;
    address public withdrawalManager;
    address public treasuryManager;

    // Emergency controls
    event Emergency(string reason);
    event ModuleUpdated(
        string moduleName,
        address oldAddress,
        address newAddress
    );

    constructor() Ownable(msg.sender) {}

    // === MODULE MANAGEMENT ===

    function setStorageContract(address _storage) external onlyOwner {
        emit ModuleUpdated("storage", storageContract, _storage);
        storageContract = _storage;
    }

    function setAccessManager(address _accessManager) external onlyOwner {
        emit ModuleUpdated("accessManager", accessManager, _accessManager);
        accessManager = _accessManager;
    }

    function setInvoiceManager(address _invoiceManager) external onlyOwner {
        emit ModuleUpdated("invoiceManager", invoiceManager, _invoiceManager);
        invoiceManager = _invoiceManager;
    }

    function setPaymentProcessor(address _paymentProcessor) external onlyOwner {
        emit ModuleUpdated(
            "paymentProcessor",
            paymentProcessor,
            _paymentProcessor
        );
        paymentProcessor = _paymentProcessor;
    }

    function setWithdrawalManager(
        address _withdrawalManager
    ) external onlyOwner {
        emit ModuleUpdated(
            "withdrawalManager",
            withdrawalManager,
            _withdrawalManager
        );
        withdrawalManager = _withdrawalManager;
    }

    function setTreasuryManager(address _treasuryManager) external onlyOwner {
        emit ModuleUpdated(
            "treasuryManager",
            treasuryManager,
            _treasuryManager
        );
        treasuryManager = _treasuryManager;
    }

    // === EMERGENCY CONTROLS ===

    function pause() external onlyOwner {
        _pause();
        emit Emergency("Contract paused by owner");
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // === ACCESS MANAGER FUNCTIONS ===

    function grantRole(bytes32 role, address account) external {
        _delegateToAccessManager(
            abi.encodeWithSignature("grantRole(bytes32,address)", role, account)
        );
    }

    function revokeRole(bytes32 role, address account) external {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "revokeRole(bytes32,address)",
                role,
                account
            )
        );
    }

    function hasRole(
        bytes32 role,
        address account
    ) external view returns (bool) {
        return IAccessManager(accessManager).hasRole(role, account);
    }

    // Role constants getters
    function getOnboardingRole() external view returns (bytes32) {
        return IAccessManager(accessManager).getOnboardingRole();
    }

    function getTokenManagerRole() external view returns (bytes32) {
        return IAccessManager(accessManager).getTokenManagerRole();
    }

    function getTreasuryManagerRole() external view returns (bytes32) {
        return IAccessManager(accessManager).getTreasuryManagerRole();
    }

    // Token whitelist
    function addTokenToWhitelist(address token) external whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("addTokenToWhitelist(address)", token)
        );
    }

    function removeTokenFromWhitelist(address token) external whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("removeTokenFromWhitelist(address)", token)
        );
    }

    function isTokenWhitelisted(address token) external view returns (bool) {
        return IAccessManager(accessManager).isTokenWhitelisted(token);
    }

    function getWhitelistedTokens() external view returns (address[] memory) {
        return IAccessManager(accessManager).getWhitelistedTokens();
    }

    // Commerce whitelist
    function addCommerceToWhitelist(address commerce) external whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("addCommerceToWhitelist(address)", commerce)
        );
    }

    function removeCommerceFromWhitelist(
        address commerce
    ) external whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "removeCommerceFromWhitelist(address)",
                commerce
            )
        );
    }

    function isCommerceWhitelisted(
        address commerce
    ) external view returns (bool) {
        return IAccessManager(accessManager).isCommerceWhitelisted(commerce);
    }

    // Fee management
    function setDefaultFeePercent(uint256 feePercent) external whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("setDefaultFeePercent(uint256)", feePercent)
        );
    }

    function setCommerceFee(
        address commerce,
        uint256 feePercent
    ) external whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "setCommerceFee(address,uint256)",
                commerce,
                feePercent
            )
        );
    }

    function getCommerceFee(address commerce) external view returns (uint256) {
        return IAccessManager(accessManager).getCommerceFee(commerce);
    }

    function getDefaultFeePercent() external view returns (uint256) {
        return IAccessManager(accessManager).getDefaultFeePercent();
    }

    // === INVOICE MANAGER FUNCTIONS ===

    function createInvoice(
        bytes32 id,
        address commerce,
        IDerampStorage.PaymentOption[] calldata paymentOptions,
        uint256 expiresAt
    ) external whenNotPaused {
        _delegateToInvoiceManager(
            abi.encodeWithSignature(
                "createInvoice(bytes32,address,(address,uint256)[],uint256)",
                id,
                commerce,
                paymentOptions,
                expiresAt
            )
        );
    }

    function cancelInvoice(bytes32 id) external whenNotPaused {
        _delegateToInvoiceManager(
            abi.encodeWithSignature("cancelInvoice(bytes32)", id)
        );
    }

    function getInvoice(
        bytes32 id
    )
        external
        view
        returns (
            bytes32 invoiceId,
            address payer,
            address commerce,
            address paidToken,
            uint256 paidAmount,
            IDerampStorage.Status status,
            uint256 createdAt,
            uint256 expiresAt,
            uint256 paidAt,
            uint256 refundedAt,
            uint256 expiredAt
        )
    {
        return IInvoiceManager(invoiceManager).getInvoice(id);
    }

    function getInvoicePaymentOptions(
        bytes32 id
    ) external view returns (IDerampStorage.PaymentOption[] memory) {
        return IInvoiceManager(invoiceManager).getInvoicePaymentOptions(id);
    }

    function getCommerceInvoices(
        address commerce
    ) external view returns (bytes32[] memory) {
        return IInvoiceManager(invoiceManager).getCommerceInvoices(commerce);
    }

    function getCommerceInvoiceCount(
        address commerce
    ) external view returns (uint256) {
        return
            IInvoiceManager(invoiceManager).getCommerceInvoiceCount(commerce);
    }

    function getCommerceInvoicesByStatus(
        address commerce,
        IDerampStorage.Status status
    ) external view returns (bytes32[] memory) {
        return
            IInvoiceManager(invoiceManager).getCommerceInvoicesByStatus(
                commerce,
                status
            );
    }

    function getRecentCommerceInvoices(
        address commerce,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        return
            IInvoiceManager(invoiceManager).getRecentCommerceInvoices(
                commerce,
                limit
            );
    }

    function getMultipleInvoices(
        bytes32[] calldata invoiceIds
    )
        external
        view
        returns (
            bytes32[] memory ids,
            address[] memory payers,
            address[] memory commerces,
            address[] memory paidTokens,
            uint256[] memory paidAmounts,
            IDerampStorage.Status[] memory statuses,
            uint256[] memory createdAts,
            uint256[] memory expiresAts,
            uint256[] memory paidAts,
            uint256[] memory refundedAts,
            uint256[] memory expiredAts
        )
    {
        return IInvoiceManager(invoiceManager).getMultipleInvoices(invoiceIds);
    }

    function getCommerceStats(
        address commerce
    )
        external
        view
        returns (
            uint256 totalInvoices,
            uint256 pendingInvoices,
            uint256 paidInvoices,
            uint256 refundedInvoices,
            uint256 expiredInvoices
        )
    {
        return IInvoiceManager(invoiceManager).getCommerceStats(commerce);
    }

    // === PAYMENT PROCESSOR FUNCTIONS ===

    function payInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount
    ) external payable whenNotPaused nonReentrant {
        _delegateToPaymentProcessor(
            abi.encodeWithSignature(
                "payInvoice(bytes32,address,uint256)",
                invoiceId,
                token,
                amount
            )
        );
    }

    function refundInvoice(bytes32 id) external whenNotPaused nonReentrant {
        _delegateToPaymentProcessor(
            abi.encodeWithSignature("refundInvoice(bytes32)", id)
        );
    }

    function getBalance(
        address commerce,
        address token
    ) external view returns (uint256) {
        return IPaymentProcessor(paymentProcessor).getBalance(commerce, token);
    }

    function getServiceFeeBalance(
        address token
    ) external view returns (uint256) {
        return IPaymentProcessor(paymentProcessor).getServiceFeeBalance(token);
    }

    // === WITHDRAWAL MANAGER FUNCTIONS ===

    function withdraw(address token) external whenNotPaused nonReentrant {
        _delegateToWithdrawalManager(
            abi.encodeWithSignature("withdraw(address)", token)
        );
    }

    function withdrawAll(
        address[] calldata tokens
    ) external whenNotPaused nonReentrant {
        _delegateToWithdrawalManager(
            abi.encodeWithSignature("withdrawAll(address[])", tokens)
        );
    }

    function getCommerceWithdrawals(
        address commerce
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        return
            IWithdrawalManager(withdrawalManager).getCommerceWithdrawals(
                commerce
            );
    }

    function getWithdrawalCount() external view returns (uint256) {
        return IWithdrawalManager(withdrawalManager).getWithdrawalCount();
    }

    // === TREASURY MANAGER FUNCTIONS ===

    function addTreasuryWallet(
        address wallet,
        string calldata description
    ) external whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "addTreasuryWallet(address,string)",
                wallet,
                description
            )
        );
    }

    function withdrawServiceFeesToTreasury(
        address token,
        address to
    ) external whenNotPaused nonReentrant {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "withdrawServiceFeesToTreasury(address,address)",
                token,
                to
            )
        );
    }

    function getTreasuryWallet(
        address wallet
    ) external view returns (IDerampStorage.TreasuryWallet memory) {
        return ITreasuryManager(treasuryManager).getTreasuryWallet(wallet);
    }

    function getActiveTreasuryWallets()
        external
        view
        returns (address[] memory)
    {
        return ITreasuryManager(treasuryManager).getActiveTreasuryWallets();
    }

    // === COMMERCE ANALYTICS FUNCTIONS ===

    function getCommerceTokens(
        address commerce
    ) external view returns (address[] memory) {
        return IInvoiceManager(invoiceManager).getCommerceTokens(commerce);
    }

    function getCommerceRevenue(
        address commerce,
        address token
    ) external view returns (uint256 totalRevenue, uint256 netRevenue) {
        return
            IInvoiceManager(invoiceManager).getCommerceRevenue(commerce, token);
    }

    function getCommerceAllRevenues(
        address commerce
    )
        external
        view
        returns (
            address[] memory tokens,
            uint256[] memory totalRevenues,
            uint256[] memory netRevenues
        )
    {
        return IInvoiceManager(invoiceManager).getCommerceAllRevenues(commerce);
    }

    // === TREASURY ANALYTICS FUNCTIONS ===

    function getServiceFeeWithdrawalStats()
        external
        view
        returns (
            uint256 totalWithdrawals,
            uint256[] memory totalAmountByToken,
            address[] memory tokens,
            address[] memory treasuryWalletList,
            uint256[][] memory amountsByTreasury
        )
    {
        return ITreasuryManager(treasuryManager).getServiceFeeWithdrawalStats();
    }

    // === COMPATIBILITY FUNCTIONS ===

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x7f5828d0 || // Ownable (ERC173)
            interfaceId == 0x5c975abb; // Pausable
    }

    // === INTERNAL DELEGATION FUNCTIONS ===

    function _delegateToAccessManager(bytes memory data) internal {
        require(accessManager != address(0), "AccessManager not set");
        (bool success, ) = accessManager.delegatecall(data);
        require(success, "AccessManager call failed");
    }

    function _delegateToInvoiceManager(bytes memory data) internal {
        require(invoiceManager != address(0), "InvoiceManager not set");
        (bool success, ) = invoiceManager.delegatecall(data);
        require(success, "InvoiceManager call failed");
    }

    function _delegateToPaymentProcessor(bytes memory data) internal {
        require(paymentProcessor != address(0), "PaymentProcessor not set");
        (bool success, ) = paymentProcessor.delegatecall(data);
        require(success, "PaymentProcessor call failed");
    }

    function _delegateToWithdrawalManager(bytes memory data) internal {
        require(withdrawalManager != address(0), "WithdrawalManager not set");
        (bool success, ) = withdrawalManager.delegatecall(data);
        require(success, "WithdrawalManager call failed");
    }

    function _delegateToTreasuryManager(bytes memory data) internal {
        require(treasuryManager != address(0), "TreasuryManager not set");
        (bool success, ) = treasuryManager.delegatecall(data);
        require(success, "TreasuryManager call failed");
    }

    // === RESCUE FUNCTIONS ===

    function rescueToken(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        // Delegate to storage contract for balance validation
        require(storageContract != address(0), "Storage not set");
        (bool success, ) = storageContract.call(
            abi.encodeWithSignature(
                "rescueToken(address,uint256,address)",
                token,
                amount,
                to
            )
        );
        require(success, "Token rescue failed");
    }

    // === FALLBACK ===

    receive() external payable {
        revert("Direct payments not allowed");
    }

    fallback() external payable {
        revert("Function not found");
    }
}
