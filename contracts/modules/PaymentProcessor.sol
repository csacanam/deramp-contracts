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
    address public immutable proxy;

    modifier onlyProxy() {
        require(msg.sender == proxy, "Only proxy can call");
        _;
    }

    constructor(address _storage, address _accessManager, address _proxy) {
        storageContract = IDerampStorage(_storage);
        accessManager = IAccessManager(_accessManager);
        proxy = _proxy;
    }

    // === PAYMENT PROCESSING ===

    function payInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount
    ) external payable onlyProxy {
        IDerampStorage.Invoice memory invoice = storageContract.getInvoice(
            invoiceId
        );
        require(invoice.id != bytes32(0), "Invoice not found");
        require(
            invoice.status == IDerampStorage.Status.PENDING,
            "Invoice is not pending"
        );
        require(
            invoice.expiresAt == 0 || block.timestamp <= invoice.expiresAt,
            "Invoice has expired"
        );

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
        require(
            accessManager.isTokenWhitelisted(token),
            "Token not globally whitelisted"
        );
        require(
            storageContract.isTokenWhitelistedForCommerce(
                invoice.commerce,
                token
            ),
            "Token not whitelisted for this commerce"
        );
        require(amount == expectedAmount, "Incorrect payment amount");

        // Transfer tokens from payer to contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate fees
        uint256 serviceFee = calculateServiceFee(invoice.commerce, amount);
        uint256 commerceAmount = amount - serviceFee;

        // Update invoice
        IDerampStorage.Invoice memory updatedInvoice = invoice;
        updatedInvoice.payer = msg.sender;
        updatedInvoice.paidToken = token;
        updatedInvoice.paidAmount = amount;
        updatedInvoice.status = IDerampStorage.Status.PAID;
        updatedInvoice.paidAt = block.timestamp;
        updatedInvoice.serviceFee = serviceFee;

        storageContract.setInvoice(invoiceId, updatedInvoice);

        // Update balances
        storageContract.addToBalance(invoice.commerce, token, commerceAmount);
        storageContract.addToServiceFeeBalance(token, serviceFee);

        // Payment tracked in invoice update

        emit IDerampStorage.InvoicePaid(invoiceId, msg.sender, token, amount);
    }

    function calculateServiceFee(
        address commerce,
        uint256 amount
    ) internal view returns (uint256) {
        uint256 feePercent = storageContract.commerceFees(commerce);
        if (feePercent == 0) {
            feePercent = storageContract.defaultFeePercent();
        }
        return (amount * feePercent) / 10000;
    }

    // === REFUND PROCESSING ===

    function refundInvoice(bytes32 invoiceId) external onlyProxy {
        IDerampStorage.Invoice memory invoice = storageContract.getInvoice(
            invoiceId
        );
        require(invoice.id != bytes32(0), "Invoice not found");
        require(
            invoice.status == IDerampStorage.Status.PAID,
            "Invoice is not paid"
        );

        uint256 refundAmount = invoice.paidAmount;

        // Check commerce balance
        require(
            storageContract.balances(invoice.commerce, invoice.paidToken) >=
                refundAmount,
            "Insufficient commerce balance"
        );

        // Update commerce balance
        storageContract.subtractFromBalance(
            invoice.commerce,
            invoice.paidToken,
            refundAmount
        );

        // Transfer refund to payer
        IERC20(invoice.paidToken).safeTransfer(invoice.payer, refundAmount);

        // Update invoice
        IDerampStorage.Invoice memory updatedInvoice = invoice;
        updatedInvoice.status = IDerampStorage.Status.REFUNDED;
        updatedInvoice.refundedAt = block.timestamp;

        storageContract.setInvoice(invoiceId, updatedInvoice);

        emit IDerampStorage.Refunded(
            invoiceId,
            invoice.payer,
            invoice.paidToken,
            refundAmount
        );
    }

    // === BALANCE MANAGEMENT ===

    function getBalance(
        address commerce,
        address token
    ) external view returns (uint256) {
        return storageContract.balances(commerce, token);
    }

    function getServiceFeeBalance(
        address token
    ) external view returns (uint256) {
        return storageContract.serviceFeeBalances(token);
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

    function getServiceFeeBalances(
        address[] calldata tokens
    ) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = storageContract.serviceFeeBalances(tokens[i]);
        }
        return balances;
    }
}
