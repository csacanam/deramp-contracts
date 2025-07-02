// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IPaymentProcessor.sol";
import "../interfaces/IAccessManager.sol";
import "../interfaces/IDerampStorage.sol";

contract PaymentProcessor is Pausable, IPaymentProcessor {
    using SafeERC20 for IERC20;

    IDerampStorage public immutable storageContract;
    IAccessManager public immutable accessManager;

    modifier onlyOwner() {
        require(accessManager.hasRole(0x00, msg.sender), "Not owner");
        _;
    }

    constructor(address _storage, address _accessManager) {
        storageContract = IDerampStorage(_storage);
        accessManager = IAccessManager(_accessManager);
    }

    // === PAYMENT PROCESSING ===

    function payInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount
    ) external payable whenNotPaused {
        IDerampStorage.Invoice memory invoice = storageContract.getInvoice(
            invoiceId
        );
        require(invoice.id != bytes32(0), "Invoice not found");
        require(
            invoice.status == IDerampStorage.Status.PENDING,
            "Invoice is not pending"
        );
        require(block.timestamp <= invoice.expiresAt, "Invoice has expired");

        // Validate payment option
        IDerampStorage.PaymentOption[] memory paymentOptions = storageContract
            .getInvoicePaymentOptions(invoiceId);
        bool validPaymentOption = false;
        uint256 expectedAmount = 0;

        for (uint256 i = 0; i < paymentOptions.length; i++) {
            if (paymentOptions[i].token == token) {
                expectedAmount = paymentOptions[i].amount;
                validPaymentOption = true;
                break;
            }
        }

        require(validPaymentOption, "Invalid payment option");
        require(amount >= expectedAmount, "Insufficient payment amount");

        // Transfer tokens from payer to contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate fees
        uint256 serviceFee = calculateServiceFee(token, amount);
        uint256 commerceAmount = amount - serviceFee;

        // Update invoice
        IDerampStorage.Invoice memory updatedInvoice = invoice;
        updatedInvoice.payer = msg.sender;
        updatedInvoice.paidToken = token;
        updatedInvoice.paidAmount = amount;
        updatedInvoice.status = IDerampStorage.Status.PAID;
        updatedInvoice.paidAt = block.timestamp;

        storageContract.setInvoice(invoiceId, updatedInvoice);

        // Update balances
        storageContract.addToBalance(invoice.commerce, token, commerceAmount);
        storageContract.addToServiceFeeBalance(token, serviceFee);

        // Payment tracked in invoice update

        emit IDerampStorage.InvoicePaid(invoiceId, msg.sender, token, amount);
    }

    function calculateServiceFee(
        address token,
        uint256 amount
    ) public view returns (uint256) {
        uint256 feePercentage = storageContract.defaultFeePercent();
        return (amount * feePercentage) / 10000; // Basis points
    }

    function updateInvoicePayment(
        bytes32 invoiceId,
        address payer,
        address token,
        uint256 amount
    ) external onlyOwner {
        IDerampStorage.Invoice memory invoice = storageContract.getInvoice(
            invoiceId
        );
        require(invoice.id != bytes32(0), "Invoice not found");

        invoice.payer = payer;
        invoice.paidToken = token;
        invoice.paidAmount = amount;
        invoice.status = IDerampStorage.Status.PAID;
        invoice.paidAt = block.timestamp;

        storageContract.setInvoice(invoiceId, invoice);
    }

    // === REFUND PROCESSING ===

    function refundInvoice(bytes32 invoiceId) external onlyOwner whenNotPaused {
        IDerampStorage.Invoice memory invoice = storageContract.getInvoice(
            invoiceId
        );
        require(invoice.id != bytes32(0), "Invoice not found");
        require(
            invoice.status == IDerampStorage.Status.PAID,
            "Invoice is not paid"
        );

        // Calculate refund amounts
        uint256 serviceFee = calculateServiceFee(
            invoice.paidToken,
            invoice.paidAmount
        );
        uint256 commerceAmount = invoice.paidAmount - serviceFee;

        // Check balances
        require(
            storageContract.balances(invoice.commerce, invoice.paidToken) >=
                commerceAmount,
            "Insufficient commerce balance"
        );
        require(
            storageContract.serviceFeeBalances(invoice.paidToken) >= serviceFee,
            "Insufficient service fee balance"
        );

        // Update balances
        storageContract.subtractFromBalance(
            invoice.commerce,
            invoice.paidToken,
            commerceAmount
        );
        storageContract.subtractFromServiceFeeBalance(
            invoice.paidToken,
            serviceFee
        );

        // Transfer refund to payer
        IERC20(invoice.paidToken).safeTransfer(
            invoice.payer,
            invoice.paidAmount
        );

        // Update invoice
        IDerampStorage.Invoice memory updatedInvoice = invoice;
        updatedInvoice.status = IDerampStorage.Status.REFUNDED;
        updatedInvoice.refundedAt = block.timestamp;

        storageContract.setInvoice(invoiceId, updatedInvoice);

        emit IDerampStorage.Refunded(
            invoiceId,
            invoice.payer,
            invoice.paidToken,
            invoice.paidAmount
        );
    }

    // === BALANCE MANAGEMENT ===

    function getBalance(
        address commerce,
        address token
    ) external view returns (uint256) {
        return storageContract.balances(commerce, token);
    }

    function getBalances(
        address commerce,
        address[] calldata tokens
    ) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = storageContract.balances(commerce, tokens[i]);
        }
        return balances;
    }

    function deductCommerceBalance(
        address commerce,
        address token,
        uint256 amount
    ) external onlyOwner {
        storageContract.subtractFromBalance(commerce, token, amount);
    }

    function deductServiceFeeBalance(
        address token,
        uint256 amount
    ) external onlyOwner {
        storageContract.subtractFromServiceFeeBalance(token, amount);
    }

    // === SERVICE FEE MANAGEMENT ===

    function getServiceFeeBalance(
        address token
    ) external view returns (uint256) {
        return storageContract.serviceFeeBalances(token);
    }

    function getServiceFeeBalances(
        address[] calldata tokens
    ) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = storageContract.serviceFeeBalances(tokens[i]);
        }
        return balances;
    }

    // === ANALYTICS FUNCTIONS (Compatibility) ===
    // Note: These functions are provided for test compatibility
    // In production, use InvoiceManager through the proxy for analytics

    /// @notice Get unique tokens used in paid invoices for a commerce
    /// @param commerce The commerce address
    /// @return Array of unique token addresses used in paid invoices
    function getCommerceTokens(
        address commerce
    ) external view returns (address[] memory) {
        bytes32[] memory allInvoices = storageContract.getCommerceInvoices(
            commerce
        );
        address[] memory tempTokens = new address[](allInvoices.length);
        uint256 uniqueCount = 0;

        for (uint256 i = 0; i < allInvoices.length; i++) {
            IDerampStorage.Invoice memory inv = storageContract.getInvoice(
                allInvoices[i]
            );
            if (
                inv.status == IDerampStorage.Status.PAID &&
                inv.paidToken != address(0)
            ) {
                bool isUnique = true;
                for (uint256 j = 0; j < uniqueCount; j++) {
                    if (tempTokens[j] == inv.paidToken) {
                        isUnique = false;
                        break;
                    }
                }
                if (isUnique) {
                    tempTokens[uniqueCount] = inv.paidToken;
                    uniqueCount++;
                }
            }
        }

        address[] memory result = new address[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            result[i] = tempTokens[i];
        }
        return result;
    }

    /// @notice Get revenue statistics for a commerce and specific token
    /// @param commerce The commerce address
    /// @param token The token address
    /// @return totalRevenue Total revenue including fees
    /// @return netRevenue Net revenue after fees
    function getCommerceRevenue(
        address commerce,
        address token
    ) external view returns (uint256 totalRevenue, uint256 netRevenue) {
        bytes32[] memory allInvoices = storageContract.getCommerceInvoices(
            commerce
        );

        for (uint256 i = 0; i < allInvoices.length; i++) {
            IDerampStorage.Invoice memory inv = storageContract.getInvoice(
                allInvoices[i]
            );
            if (
                inv.status == IDerampStorage.Status.PAID &&
                inv.paidToken == token
            ) {
                totalRevenue += inv.paidAmount;
                uint256 serviceFee = calculateServiceFee(token, inv.paidAmount);
                netRevenue += (inv.paidAmount - serviceFee);
            }
        }
    }

    /// @notice Get all revenue statistics for a commerce across all tokens
    /// @param commerce The commerce address
    /// @return tokens Array of token addresses
    /// @return totalRevenues Array of total revenues per token
    /// @return netRevenues Array of net revenues per token
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
        address[] memory allTokens = this.getCommerceTokens(commerce);
        tokens = allTokens;
        totalRevenues = new uint256[](allTokens.length);
        netRevenues = new uint256[](allTokens.length);

        for (uint256 i = 0; i < allTokens.length; i++) {
            (totalRevenues[i], netRevenues[i]) = this.getCommerceRevenue(
                commerce,
                allTokens[i]
            );
        }
    }

    // === EMERGENCY FUNCTIONS ===

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
