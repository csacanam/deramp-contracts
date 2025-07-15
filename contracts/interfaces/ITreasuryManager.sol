// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IDerampStorage.sol";

interface ITreasuryManager {
    // Treasury wallet management
    function addTreasuryWallet(
        address wallet,
        string calldata description
    ) external;

    function removeTreasuryWallet(address wallet) external;

    function setTreasuryWalletStatus(address wallet, bool isActive) external;

    function updateTreasuryWallet(
        address wallet,
        IDerampStorage.TreasuryWallet calldata updatedWallet
    ) external;

    // Treasury wallet queries
    function getTreasuryWallet(
        address wallet
    ) external view returns (IDerampStorage.TreasuryWallet memory);

    function getAllTreasuryWallets() external view returns (address[] memory);

    function getActiveTreasuryWallets()
        external
        view
        returns (address[] memory);

    function getTreasuryWallets()
        external
        view
        returns (IDerampStorage.TreasuryWallet[] memory);

    // Service fee withdrawals
    function withdrawServiceFeesToTreasury(address token, address to) external;

    function withdrawAllServiceFeesToTreasury(
        address[] calldata tokens,
        address to
    ) external;

    function withdrawAllServiceFeesToTreasury(address to) external;

    // Treasury withdrawal history
    function getServiceFeeWithdrawalIndices()
        external
        view
        returns (uint256[] memory);

    function getServiceFeeWithdrawals()
        external
        view
        returns (IDerampStorage.WithdrawalRecord[] memory);

    function getRecentServiceFeeWithdrawals(
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory);

    // Treasury statistics
    function getServiceFeeWithdrawalStats()
        external
        view
        returns (
            uint256 totalWithdrawals,
            uint256[] memory totalAmountByToken,
            address[] memory tokens,
            address[] memory treasuryWalletList,
            uint256[][] memory amountsByTreasury
        );

    // Validation
    function isTreasuryWalletActive(
        address wallet
    ) external view returns (bool);
}
