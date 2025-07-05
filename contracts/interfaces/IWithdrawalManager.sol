// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IDerampStorage.sol";

interface IWithdrawalManager {
    // Commerce withdrawals
    function withdraw(address commerce, address token) external;

    function withdrawAll(address commerce, address[] calldata tokens) external;

    function withdrawTo(
        address commerce,
        address token,
        uint256 amount,
        address to
    ) external;

    // Withdrawal tracking queries
    function getWithdrawalCount() external view returns (uint256);

    function getWithdrawal(
        uint256 index
    ) external view returns (IDerampStorage.WithdrawalRecord memory);

    function getMultipleWithdrawals(
        uint256[] calldata indices
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    function getRecentWithdrawals(
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    // Commerce withdrawal history
    function getCommerceWithdrawalIndices(
        address commerce
    ) external view returns (uint256[] memory);

    function getCommerceWithdrawals(
        address commerce
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    function getRecentCommerceWithdrawals(
        address commerce,
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    // Commerce withdrawal statistics
    function getCommerceWithdrawalStats(
        address commerce
    )
        external
        view
        returns (
            uint256 totalWithdrawals,
            uint256[] memory totalAmountByToken,
            address[] memory tokens
        );

    // Internal functions for recording withdrawals
    function recordWithdrawal(
        address token,
        uint256 amount,
        address to,
        IDerampStorage.WithdrawalType withdrawalType,
        bytes32 invoiceId
    ) external;
}
