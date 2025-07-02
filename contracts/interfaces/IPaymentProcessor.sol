// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IDerampStorage.sol";

interface IPaymentProcessor {
    // Payment processing
    function payInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount
    ) external payable;

    function refundInvoice(bytes32 id) external;

    // Balance queries
    function getBalance(
        address commerce,
        address token
    ) external view returns (uint256);

    function getBalances(
        address commerce,
        address[] calldata tokens
    ) external view returns (uint256[] memory amounts);

    function getServiceFeeBalance(
        address token
    ) external view returns (uint256);

    function getServiceFeeBalances(
        address[] calldata tokens
    ) external view returns (uint256[] memory amounts);

    // Internal functions exposed for other modules
    function updateInvoicePayment(
        bytes32 invoiceId,
        address payer,
        address token,
        uint256 amount
    ) external;

    function calculateServiceFee(
        address commerce,
        uint256 amount
    ) external view returns (uint256 feeAmount);

    // Balance management (for withdrawals)
    function deductCommerceBalance(
        address commerce,
        address token,
        uint256 amount
    ) external;

    function deductServiceFeeBalance(address token, uint256 amount) external;

    // === ANALYTICS FUNCTIONS (Compatibility) ===
    // Note: These functions are provided for test compatibility
    // In production, use InvoiceManager through the proxy for analytics

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
