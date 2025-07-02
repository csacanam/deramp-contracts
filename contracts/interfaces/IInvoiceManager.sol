// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IDerampStorage.sol";

interface IInvoiceManager {
    // Invoice management
    function createInvoice(
        bytes32 id,
        address commerce,
        IDerampStorage.PaymentOption[] calldata paymentOptions,
        uint256 expiresAt
    ) external;

    function cancelInvoice(bytes32 id) external;

    function expireInvoice(bytes32 id) external;

    // Invoice queries
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
        );

    function getInvoicePaymentOptions(
        bytes32 id
    ) external view returns (IDerampStorage.PaymentOption[] memory);

    // Commerce invoice queries
    function getCommerceInvoices(
        address commerce
    ) external view returns (bytes32[] memory);

    function getCommerceInvoicesByStatus(
        address commerce,
        IDerampStorage.Status status
    ) external view returns (bytes32[] memory);

    function getRecentCommerceInvoices(
        address commerce,
        uint256 limit
    ) external view returns (bytes32[] memory);

    // Batch queries
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
        );

    // Statistics
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
        );

    // Validation
    function invoiceExists(bytes32 id) external view returns (bool);

    function isInvoiceCommerce(
        bytes32 id,
        address commerce
    ) external view returns (bool);

    // Commerce invoice count
    function getCommerceInvoiceCount(
        address commerce
    ) external view returns (uint256);

    // Commerce analytics functions
    function getCommerceTokens(
        address commerce
    ) external view returns (address[] memory);

    function getCommerceRevenue(
        address commerce,
        address token
    ) external view returns (uint256 totalRevenue, uint256 netRevenue);

    function getCommerceAllRevenues(
        address commerce
    )
        external
        view
        returns (
            address[] memory tokens,
            uint256[] memory totalRevenues,
            uint256[] memory netRevenues
        );
}
