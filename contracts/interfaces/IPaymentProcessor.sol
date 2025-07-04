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
}
