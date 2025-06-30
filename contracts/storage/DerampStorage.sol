// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IDerampStorage.sol";

contract DerampStorage is Ownable, IDerampStorage {
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

    // Withdrawal tracking
    WithdrawalRecord[] public withdrawalHistory;
    mapping(address => uint256[]) public commerceWithdrawals;
    mapping(address => uint256[]) public treasuryWithdrawals;
    uint256[] public serviceFeeWithdrawals;

    // Module addresses
    mapping(string => address) public modules;
    mapping(address => bool) public authorizedModules;

    constructor() Ownable(msg.sender) {}

    // Module management
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

    // Storage functions - only callable by authorized modules
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

    function setWhitelistedToken(
        address token,
        bool whitelisted
    ) external onlyAuthorizedModule {
        whitelistedTokens[token] = whitelisted;
    }

    function setWhitelistedCommerce(
        address commerce,
        bool whitelisted
    ) external onlyAuthorizedModule {
        whitelistedCommerces[commerce] = whitelisted;
    }

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

    function addCommerceInvoice(
        address commerce,
        bytes32 invoiceId
    ) external onlyAuthorizedModule {
        commerceInvoices[commerce].push(invoiceId);
    }

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

    function getServiceFeeBalance(
        address token
    ) external view returns (uint256) {
        return serviceFeeBalances[token];
    }

    function getTreasuryWallets()
        external
        view
        returns (TreasuryWallet[] memory)
    {
        TreasuryWallet[] memory wallets = new TreasuryWallet[](
            treasuryWalletsList.length
        );
        for (uint256 i = 0; i < treasuryWalletsList.length; i++) {
            wallets[i] = treasuryWallets[treasuryWalletsList[i]];
        }
        return wallets;
    }

    function getServiceFeeTokens() external view returns (address[] memory) {
        // Return tokens that have service fee balances > 0
        // This is a simplified implementation - in production you might want to track this more efficiently
        address[] memory allTokens = new address[](0); // Placeholder
        return allTokens;
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

    // View functions
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

    // === ANALYTICS FUNCTIONS ===

    /// @notice Get unique tokens used in paid invoices for a commerce
    /// @param commerce The commerce address
    /// @return Array of unique token addresses used in paid invoices
    function getCommerceTokens(
        address commerce
    ) external view returns (address[] memory) {
        bytes32[] memory allInvoices = commerceInvoices[commerce];
        address[] memory tempTokens = new address[](allInvoices.length);
        uint256 uniqueCount = 0;

        for (uint256 i = 0; i < allInvoices.length; i++) {
            Invoice memory inv = invoices[allInvoices[i]];
            if (inv.status == Status.PAID && inv.paidToken != address(0)) {
                // Check if token is already in the array
                bool exists = false;
                for (uint256 j = 0; j < uniqueCount; j++) {
                    if (tempTokens[j] == inv.paidToken) {
                        exists = true;
                        break;
                    }
                }

                // Add token if it's not already in the array
                if (!exists) {
                    tempTokens[uniqueCount] = inv.paidToken;
                    uniqueCount++;
                }
            }
        }

        // Create result array with exact size
        address[] memory result = new address[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            result[i] = tempTokens[i];
        }

        return result;
    }

    /// @notice Get commerce total revenue by token (only paid invoices)
    /// @param commerce The commerce address
    /// @param token The token address
    /// @return totalRevenue Total amount collected from paid invoices (before fees)
    /// @return netRevenue Net amount (after service fees)
    function getCommerceRevenue(
        address commerce,
        address token
    ) external view returns (uint256 totalRevenue, uint256 netRevenue) {
        bytes32[] memory allInvoices = commerceInvoices[commerce];
        uint256 feePercent = commerceFees[commerce];
        if (feePercent == 0) {
            feePercent = defaultFeePercent;
        }

        for (uint256 i = 0; i < allInvoices.length; i++) {
            Invoice memory inv = invoices[allInvoices[i]];
            if (inv.status == Status.PAID && inv.paidToken == token) {
                totalRevenue += inv.paidAmount;
                uint256 feeAmount = (inv.paidAmount * feePercent) / 10000;
                netRevenue += (inv.paidAmount - feeAmount);
            }
        }
    }

    /// @notice Get commerce revenue for all tokens (only paid invoices)
    /// @param commerce The commerce address
    /// @return tokens Array of token addresses
    /// @return totalRevenues Array of total revenues per token (before fees)
    /// @return netRevenues Array of net revenues per token (after fees)
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
        tokens = this.getCommerceTokens(commerce);
        totalRevenues = new uint256[](tokens.length);
        netRevenues = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            (totalRevenues[i], netRevenues[i]) = this.getCommerceRevenue(
                commerce,
                tokens[i]
            );
        }
    }

    // === EXISTING VIEW FUNCTIONS ===

    function getTreasuryWalletsList() external view returns (address[] memory) {
        return treasuryWalletsList;
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
}
