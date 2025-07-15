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

    function getWithdrawalHistory()
        external
        view
        returns (IDerampStorage.WithdrawalRecord[] memory);

    function getWithdrawalsByType(
        IDerampStorage.WithdrawalType withdrawalType
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    function getWithdrawalsByToken(
        address token
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    function getWithdrawalsByDateRange(
        uint256 fromTimestamp,
        uint256 toTimestamp
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    function getTotalWithdrawalsByToken(
        address token
    ) external view returns (uint256 totalAmount, uint256 totalCount);
}
