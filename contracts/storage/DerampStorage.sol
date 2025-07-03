// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IDerampStorage.sol";

contract DerampStorage is Ownable, IDerampStorage {
    // === STATE VARIABLES ===

    // Core mappings
    mapping(bytes32 => Invoice) public invoices;
    mapping(bytes32 => PaymentOption[]) public invoicePaymentOptions;
    mapping(address => mapping(address => uint256)) public balances; // commerce => token => amount
    mapping(address => bool) public whitelistedTokens;
    mapping(address => bool) public whitelistedCommerces;

    // Fee system
    uint256 public defaultFeePercent = 100; // 1% in basis points
    mapping(address => uint256) public commerceFees;
    mapping(address => uint256) public serviceFeeBalances;

    // Commerce invoice tracking
    mapping(address => bytes32[]) public commerceInvoices;

    // Treasury system
    mapping(address => TreasuryWallet) public treasuryWallets;
    address[] public treasuryWalletsList;

    // Token tracking
    address[] public whitelistedTokensList;

    // Withdrawal tracking
    WithdrawalRecord[] public withdrawalHistory;
    mapping(address => uint256[]) public commerceWithdrawals;
    mapping(address => uint256[]) public treasuryWithdrawals;
    uint256[] public serviceFeeWithdrawals;

    // Module addresses
    mapping(string => address) public modules;
    mapping(address => bool) public authorizedModules;

    // Per-commerce token whitelist
    mapping(address => mapping(address => bool)) public commerceTokenWhitelist;

    constructor() Ownable(msg.sender) {}

    // === MODULE MANAGEMENT ===

    function setModule(
        string calldata name,
        address moduleAddress
    ) external onlyOwner {
        modules[name] = moduleAddress;
        authorizedModules[moduleAddress] = true;
    }

    function removeModule(string calldata name) external onlyOwner {
        address moduleAddress = modules[name];
        modules[name] = address(0);
        authorizedModules[moduleAddress] = false;
    }

    modifier onlyAuthorizedModule() {
        require(authorizedModules[msg.sender], "Unauthorized module");
        _;
    }

    // === TOKEN WHITELIST MANAGEMENT ===

    function setWhitelistedToken(
        address token,
        bool whitelisted
    ) external onlyAuthorizedModule {
        bool wasWhitelisted = whitelistedTokens[token];
        whitelistedTokens[token] = whitelisted;

        if (whitelisted && !wasWhitelisted) {
            // Agregar a la lista
            whitelistedTokensList.push(token);
        } else if (!whitelisted && wasWhitelisted) {
            // Remover de la lista
            _removeTokenFromList(token);
        }
    }

    function _removeTokenFromList(address token) internal {
        for (uint256 i = 0; i < whitelistedTokensList.length; i++) {
            if (whitelistedTokensList[i] == token) {
                whitelistedTokensList[i] = whitelistedTokensList[
                    whitelistedTokensList.length - 1
                ];
                whitelistedTokensList.pop();
                break;
            }
        }
    }

    function getWhitelistedTokens() external view returns (address[] memory) {
        return whitelistedTokensList;
    }

    // === COMMERCE WHITELIST MANAGEMENT ===

    function setWhitelistedCommerce(
        address commerce,
        bool whitelisted
    ) external onlyAuthorizedModule {
        whitelistedCommerces[commerce] = whitelisted;
    }

    // === FEE MANAGEMENT ===

    function setDefaultFeePercent(
        uint256 feePercent
    ) external onlyAuthorizedModule {
        defaultFeePercent = feePercent;
    }

    function setCommerceFee(
        address commerce,
        uint256 feePercent
    ) external onlyAuthorizedModule {
        commerceFees[commerce] = feePercent;
    }

    // === INVOICE MANAGEMENT ===

    function setInvoice(
        bytes32 id,
        Invoice calldata invoice
    ) external onlyAuthorizedModule {
        invoices[id] = invoice;
    }

    function addPaymentOption(
        bytes32 invoiceId,
        PaymentOption calldata option
    ) external onlyAuthorizedModule {
        invoicePaymentOptions[invoiceId].push(option);
    }

    function clearPaymentOptions(
        bytes32 invoiceId
    ) external onlyAuthorizedModule {
        delete invoicePaymentOptions[invoiceId];
    }

    function addCommerceInvoice(
        address commerce,
        bytes32 invoiceId
    ) external onlyAuthorizedModule {
        commerceInvoices[commerce].push(invoiceId);
    }

    function getInvoice(bytes32 id) external view returns (Invoice memory) {
        return invoices[id];
    }

    function getInvoicePaymentOptions(
        bytes32 id
    ) external view returns (PaymentOption[] memory) {
        return invoicePaymentOptions[id];
    }

    function getCommerceInvoices(
        address commerce
    ) external view returns (bytes32[] memory) {
        return commerceInvoices[commerce];
    }

    // === BALANCE MANAGEMENT ===

    function setBalance(
        address commerce,
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        balances[commerce][token] = amount;
    }

    function addToBalance(
        address commerce,
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        balances[commerce][token] += amount;
    }

    function subtractFromBalance(
        address commerce,
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        require(balances[commerce][token] >= amount, "Insufficient balance");
        balances[commerce][token] -= amount;
    }

    function subtractCommerceBalance(
        address commerce,
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        require(
            balances[commerce][token] >= amount,
            "Insufficient commerce balance"
        );
        balances[commerce][token] -= amount;
    }

    function getCommerceBalance(
        address commerce,
        address token
    ) external view returns (uint256) {
        return balances[commerce][token];
    }

    // === SERVICE FEE MANAGEMENT ===

    function setServiceFeeBalance(
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        serviceFeeBalances[token] = amount;
    }

    function addToServiceFeeBalance(
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        serviceFeeBalances[token] += amount;
    }

    function subtractFromServiceFeeBalance(
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        require(
            serviceFeeBalances[token] >= amount,
            "Insufficient service fee balance"
        );
        serviceFeeBalances[token] -= amount;
    }

    function subtractServiceFeeBalance(
        address token,
        uint256 amount
    ) external onlyAuthorizedModule {
        require(
            serviceFeeBalances[token] >= amount,
            "Insufficient service fee balance"
        );
        serviceFeeBalances[token] -= amount;
    }

    function getServiceFeeBalance(
        address token
    ) external view returns (uint256) {
        return serviceFeeBalances[token];
    }

    function getServiceFeeTokens() external view returns (address[] memory) {
        // Return tokens that have service fee balances > 0
        // This is a simplified implementation - in production you might want to track this more efficiently
        address[] memory allTokens = new address[](0); // Placeholder
        return allTokens;
    }

    // === TREASURY MANAGEMENT ===

    function setTreasuryWallet(
        address wallet,
        TreasuryWallet calldata treasuryWallet
    ) external onlyAuthorizedModule {
        treasuryWallets[wallet] = treasuryWallet;
    }

    function addTreasuryWalletToList(
        address wallet
    ) external onlyAuthorizedModule {
        treasuryWalletsList.push(wallet);
    }

    function removeTreasuryWalletFromList(
        address wallet
    ) external onlyAuthorizedModule {
        for (uint256 i = 0; i < treasuryWalletsList.length; i++) {
            if (treasuryWalletsList[i] == wallet) {
                treasuryWalletsList[i] = treasuryWalletsList[
                    treasuryWalletsList.length - 1
                ];
                treasuryWalletsList.pop();
                break;
            }
        }
    }

    function setTreasuryWalletStatus(
        address wallet,
        bool isActive
    ) external onlyAuthorizedModule {
        treasuryWallets[wallet].isActive = isActive;
    }

    function updateTreasuryWallet(
        address wallet,
        TreasuryWallet calldata updatedWallet
    ) external onlyAuthorizedModule {
        treasuryWallets[wallet] = updatedWallet;
    }

    function getTreasuryWallet(
        address wallet
    ) external view returns (TreasuryWallet memory) {
        return treasuryWallets[wallet];
    }

    function getTreasuryWalletsList() external view returns (address[] memory) {
        return treasuryWalletsList;
    }

    // === WITHDRAWAL MANAGEMENT ===

    function addWithdrawalRecord(
        WithdrawalRecord calldata record
    ) external onlyAuthorizedModule returns (uint256) {
        uint256 index = withdrawalHistory.length;
        withdrawalHistory.push(record);
        return index;
    }

    function addCommerceWithdrawal(
        address commerce,
        uint256 index
    ) external onlyAuthorizedModule {
        commerceWithdrawals[commerce].push(index);
    }

    function addTreasuryWithdrawal(
        address treasury,
        uint256 index
    ) external onlyAuthorizedModule {
        treasuryWithdrawals[treasury].push(index);
    }

    function addServiceFeeWithdrawal(
        uint256 index
    ) external onlyAuthorizedModule {
        serviceFeeWithdrawals.push(index);
    }

    function getWithdrawalHistory()
        external
        view
        returns (WithdrawalRecord[] memory)
    {
        return withdrawalHistory;
    }

    function getCommerceWithdrawals(
        address commerce
    ) external view returns (uint256[] memory) {
        return commerceWithdrawals[commerce];
    }

    function getTreasuryWithdrawals(
        address treasury
    ) external view returns (uint256[] memory) {
        return treasuryWithdrawals[treasury];
    }

    function getServiceFeeWithdrawals()
        external
        view
        returns (uint256[] memory)
    {
        return serviceFeeWithdrawals;
    }

    // === PER-COMMERCE TOKEN WHITELIST MANAGEMENT ===

    function setCommerceTokenWhitelisted(
        address commerce,
        address token,
        bool whitelisted
    ) external onlyAuthorizedModule {
        commerceTokenWhitelist[commerce][token] = whitelisted;
    }

    function isTokenWhitelistedForCommerce(
        address commerce,
        address token
    ) external view returns (bool) {
        return commerceTokenWhitelist[commerce][token];
    }
}
