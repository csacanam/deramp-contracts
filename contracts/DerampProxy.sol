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

    // === MODIFIERS ===
    modifier onlyTokenManagerOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getTokenManagerRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyOnboardingOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getOnboardingRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyTreasuryManagerOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getTreasuryManagerRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyBackendOperatorOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getBackendOperatorRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyAdmin() {
        require(
            IAccessManager(accessManager).hasRole(
                IAccessManager(accessManager).getDefaultAdminRole(),
                msg.sender
            ),
            "Not admin"
        );
        _;
    }
    modifier onlyCommerceOrAdminOrBackend(address commerce) {
        IAccessManager am = IAccessManager(accessManager);
        require(
            msg.sender == commerce ||
                am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getBackendOperatorRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyRegisteredCommerce() {
        require(
            IAccessManager(accessManager).isCommerceWhitelisted(msg.sender),
            "Commerce not whitelisted"
        );
        _;
    }

    // Internal modifier for commerce, admin, or backend
    function _onlyCommerceOrAdminOrBackend(address commerce) internal view {
        IAccessManager am = IAccessManager(accessManager);
        require(
            msg.sender == commerce ||
                am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getBackendOperatorRole(), msg.sender),
            "Not authorized"
        );
    }

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
    function grantRole(bytes32 role, address account) external onlyAdmin {
        _delegateToAccessManager(
            abi.encodeWithSignature("grantRole(bytes32,address)", role, account)
        );
    }

    function revokeRole(bytes32 role, address account) external onlyAdmin {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "revokeRole(bytes32,address)",
                role,
                account
            )
        );
    }

    // Token whitelist
    function addTokenToWhitelist(
        address token
    ) external onlyTokenManagerOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("addTokenToWhitelist(address)", token)
        );
    }

    function removeTokenFromWhitelist(
        address token
    ) external onlyTokenManagerOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("removeTokenFromWhitelist(address)", token)
        );
    }

    // Commerce whitelist
    function addCommerceToWhitelist(
        address commerce
    ) external onlyOnboardingOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("addCommerceToWhitelist(address)", commerce)
        );
    }

    function removeCommerceFromWhitelist(
        address commerce
    ) external onlyOnboardingOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "removeCommerceFromWhitelist(address)",
                commerce
            )
        );
    }

    // Fee management
    function setDefaultFeePercent(
        uint256 feePercent
    ) external onlyOnboardingOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature("setDefaultFeePercent(uint256)", feePercent)
        );
    }

    function setCommerceFee(
        address commerce,
        uint256 feePercent
    ) external onlyOnboardingOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "setCommerceFee(address,uint256)",
                commerce,
                feePercent
            )
        );
    }

    // Treasury management
    function addTreasuryWallet(
        address wallet,
        string calldata description
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "addTreasuryWallet(address,string)",
                wallet,
                description
            )
        );
    }

    function removeTreasuryWallet(
        address wallet
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature("removeTreasuryWallet(address)", wallet)
        );
    }

    function setTreasuryWalletStatus(
        address wallet,
        bool isActive
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "setTreasuryWalletStatus(address,bool)",
                wallet,
                isActive
            )
        );
    }

    function withdrawServiceFeesToTreasury(
        address token,
        address to
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "withdrawServiceFeesToTreasury(address,address)",
                token,
                to
            )
        );
    }

    function withdrawServiceFeesToTreasury(
        address[] calldata tokens,
        address to
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "withdrawServiceFeesToTreasury(address[],address)",
                tokens,
                to
            )
        );
    }

    function withdrawAllServiceFeesToTreasury(
        address to
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "withdrawAllServiceFeesToTreasury(address)",
                to
            )
        );
    }

    // === INVOICE MANAGER FUNCTIONS ===
    function createInvoice(
        bytes32 id,
        address commerce,
        IDerampStorage.PaymentOption[] calldata paymentOptions,
        uint256 expiresAt
    ) external onlyCommerceOrAdminOrBackend(commerce) whenNotPaused {
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
        address commerce = IDerampStorage(storageContract)
            .getInvoice(id)
            .commerce;
        require(commerce != address(0), "Invoice not found");
        _onlyCommerceOrAdminOrBackend(commerce);
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

    function invoiceExists(bytes32 id) external view returns (bool) {
        return IInvoiceManager(invoiceManager).invoiceExists(id);
    }

    function isInvoiceCommerce(
        bytes32 id,
        address commerce
    ) external view returns (bool) {
        return IInvoiceManager(invoiceManager).isInvoiceCommerce(id, commerce);
    }

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
        address commerce = IDerampStorage(storageContract)
            .getInvoice(id)
            .commerce;
        require(commerce != address(0), "Invoice not found");
        _onlyCommerceOrAdminOrBackend(commerce);
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

    function getBalances(
        address commerce,
        address[] calldata tokens
    ) external view returns (uint256[] memory) {
        return
            IPaymentProcessor(paymentProcessor).getBalances(commerce, tokens);
    }

    function getServiceFeeBalances(
        address[] calldata tokens
    ) external view returns (uint256[] memory) {
        return
            IPaymentProcessor(paymentProcessor).getServiceFeeBalances(tokens);
    }

    // === WITHDRAWAL MANAGER FUNCTIONS ===

    function withdraw(
        address token
    ) external whenNotPaused nonReentrant onlyRegisteredCommerce {
        _delegateToWithdrawalManager(
            abi.encodeWithSignature(
                "withdraw(address,address)",
                msg.sender,
                token
            )
        );
    }

    function withdrawAll(
        address[] calldata tokens
    ) external whenNotPaused nonReentrant onlyRegisteredCommerce {
        _delegateToWithdrawalManager(
            abi.encodeWithSignature(
                "withdrawAll(address,address[])",
                msg.sender,
                tokens
            )
        );
    }

    function withdrawTo(
        address token,
        uint256 amount,
        address to
    ) external whenNotPaused nonReentrant onlyRegisteredCommerce {
        _delegateToWithdrawalManager(
            abi.encodeWithSignature(
                "withdrawTo(address,address,uint256,address)",
                msg.sender,
                token,
                amount,
                to
            )
        );
    }

    function getWithdrawalCount() external view returns (uint256) {
        return IWithdrawalManager(withdrawalManager).getWithdrawalCount();
    }

    function getWithdrawal(
        uint256 index
    ) external view returns (IDerampStorage.WithdrawalRecord memory) {
        return IWithdrawalManager(withdrawalManager).getWithdrawal(index);
    }

    function getMultipleWithdrawals(
        uint256[] calldata indices
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        return
            IWithdrawalManager(withdrawalManager).getMultipleWithdrawals(
                indices
            );
    }

    function getWithdrawalHistory()
        external
        view
        returns (IDerampStorage.WithdrawalRecord[] memory)
    {
        return IWithdrawalManager(withdrawalManager).getWithdrawalHistory();
    }

    function getCommerceWithdrawals(
        address commerce
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        return
            IWithdrawalManager(withdrawalManager).getCommerceWithdrawals(
                commerce
            );
    }

    function getWithdrawalsByType(
        IDerampStorage.WithdrawalType withdrawalType
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        return
            IWithdrawalManager(withdrawalManager).getWithdrawalsByType(
                withdrawalType
            );
    }

    function getWithdrawalsByToken(
        address token
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        return
            IWithdrawalManager(withdrawalManager).getWithdrawalsByToken(token);
    }

    function getRecentWithdrawals(
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        return
            IWithdrawalManager(withdrawalManager).getRecentWithdrawals(limit);
    }

    function getWithdrawalsByDateRange(
        uint256 fromTimestamp,
        uint256 toTimestamp
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        return
            IWithdrawalManager(withdrawalManager).getWithdrawalsByDateRange(
                fromTimestamp,
                toTimestamp
            );
    }

    function getTotalWithdrawalsByToken(
        address token
    ) external view returns (uint256 totalAmount, uint256 totalCount) {
        return
            IWithdrawalManager(withdrawalManager).getTotalWithdrawalsByToken(
                token
            );
    }

    // === TREASURY MANAGER FUNCTIONS ===

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

    function updateTreasuryWallet(
        address wallet,
        IDerampStorage.TreasuryWallet calldata updatedWallet
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "updateTreasuryWallet(address,(address,bool,uint256,string))",
                wallet,
                updatedWallet
            )
        );
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

    // === PER-COMMERCE TOKEN WHITELIST MANAGEMENT ===
    function addTokenToCommerceWhitelist(
        address commerce,
        address[] calldata tokens
    ) external onlyOnboardingOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "addTokenToCommerceWhitelist(address,address[])",
                commerce,
                tokens
            )
        );
    }

    function removeTokenFromCommerceWhitelist(
        address commerce,
        address[] calldata tokens
    ) external onlyOnboardingOrAdmin whenNotPaused {
        _delegateToAccessManager(
            abi.encodeWithSignature(
                "removeTokenFromCommerceWhitelist(address,address[])",
                commerce,
                tokens
            )
        );
    }

    function isTokenWhitelistedForCommerce(
        address commerce,
        address token
    ) external view returns (bool) {
        return
            IAccessManager(accessManager).isTokenWhitelistedForCommerce(
                commerce,
                token
            );
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
