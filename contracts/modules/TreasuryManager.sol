// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/ITreasuryManager.sol";
import "../interfaces/IAccessManager.sol";
import "../interfaces/IDerampStorage.sol";

contract TreasuryManager is Pausable, ITreasuryManager {
    using SafeERC20 for IERC20;

    IDerampStorage public immutable storageContract;
    IAccessManager public immutable accessManager;
    address public immutable proxy;

    bytes32 public constant TREASURY_MANAGER_ROLE =
        keccak256("TREASURY_MANAGER_ROLE");

    modifier onlyProxy() {
        require(msg.sender == proxy, "Only proxy can call");
        _;
    }

    constructor(address _storage, address _accessManager, address _proxy) {
        storageContract = IDerampStorage(_storage);
        accessManager = IAccessManager(_accessManager);
        proxy = _proxy;
    }

    // === TREASURY WALLET MANAGEMENT ===

    function addTreasuryWallet(
        address wallet,
        string calldata description
    ) external onlyProxy {
        require(wallet != address(0), "Invalid wallet address");

        IDerampStorage.TreasuryWallet memory treasuryWallet = IDerampStorage
            .TreasuryWallet({
                wallet: wallet,
                isActive: true,
                addedAt: block.timestamp,
                description: description
            });

        storageContract.setTreasuryWallet(wallet, treasuryWallet);
        storageContract.addTreasuryWalletToList(wallet);

        emit IDerampStorage.TreasuryWalletAdded(wallet, description);
    }

    function removeTreasuryWallet(address wallet) external onlyProxy {
        storageContract.removeTreasuryWalletFromList(wallet);
        emit IDerampStorage.TreasuryWalletRemoved(wallet);
    }

    function setTreasuryWalletStatus(
        address wallet,
        bool isActive
    ) external onlyProxy {
        storageContract.setTreasuryWalletStatus(wallet, isActive);
        emit IDerampStorage.TreasuryWalletStatusChanged(wallet, isActive);
    }

    // === SERVICE FEE WITHDRAWALS ===

    function withdrawServiceFeesToTreasury(
        address token,
        address to
    ) external onlyProxy {
        uint256 amount = storageContract.getServiceFeeBalance(token);
        require(amount > 0, "No service fees to withdraw");

        storageContract.subtractServiceFeeBalance(token, amount);
        IERC20(token).safeTransfer(to, amount);

        emit IDerampStorage.ServiceFeeWithdrawn(token, amount, to);
    }

    function withdrawAllServiceFeesToTreasury(
        address[] calldata tokens,
        address to
    ) external onlyProxy {
        require(tokens.length > 0, "No tokens provided");
        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 amount = storageContract.getServiceFeeBalance(tokens[i]);
            if (amount > 0) {
                storageContract.subtractServiceFeeBalance(tokens[i], amount);
                IERC20(tokens[i]).safeTransfer(to, amount);
                emit IDerampStorage.ServiceFeeWithdrawn(tokens[i], amount, to);
                totalWithdrawn++;
            }
        }

        require(totalWithdrawn > 0, "No service fees to withdraw");
    }

    function withdrawAllServiceFeesToTreasury(address to) external onlyProxy {
        require(to != address(0), "Invalid treasury address");
        require(
            storageContract.getTreasuryWallet(to).isActive,
            "Treasury wallet not active"
        );

        // Get tokens with service fees
        address[] memory serviceFeeTokens = storageContract
            .getServiceFeeTokens();
        require(serviceFeeTokens.length > 0, "No tokens with service fees");

        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < serviceFeeTokens.length; i++) {
            uint256 amount = storageContract.getServiceFeeBalance(
                serviceFeeTokens[i]
            );
            if (amount > 0) {
                storageContract.subtractServiceFeeBalance(
                    serviceFeeTokens[i],
                    amount
                );
                IERC20(serviceFeeTokens[i]).safeTransfer(to, amount);
                emit IDerampStorage.ServiceFeeWithdrawn(
                    serviceFeeTokens[i],
                    amount,
                    to
                );
                totalWithdrawn++;
            }
        }

        require(totalWithdrawn > 0, "No service fees to withdraw");
    }

    // === VIEW FUNCTIONS ===

    function getTreasuryWallet(
        address wallet
    ) external view returns (IDerampStorage.TreasuryWallet memory) {
        return storageContract.getTreasuryWallet(wallet);
    }

    function getAllTreasuryWallets() external view returns (address[] memory) {
        return storageContract.getTreasuryWalletsList();
    }

    function getActiveTreasuryWallets()
        external
        view
        returns (address[] memory)
    {
        address[] memory allWallets = storageContract.getTreasuryWalletsList();
        address[] memory tempActive = new address[](allWallets.length);
        uint256 activeCount = 0;

        for (uint256 i = 0; i < allWallets.length; i++) {
            IDerampStorage.TreasuryWallet memory wallet = storageContract
                .getTreasuryWallet(allWallets[i]);
            if (wallet.isActive) {
                tempActive[activeCount] = allWallets[i];
                activeCount++;
            }
        }

        address[] memory activeWallets = new address[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            activeWallets[i] = tempActive[i];
        }

        return activeWallets;
    }

    function isTreasuryWalletActive(
        address wallet
    ) external view returns (bool) {
        IDerampStorage.TreasuryWallet memory treasuryWallet = storageContract
            .getTreasuryWallet(wallet);
        return treasuryWallet.wallet != address(0) && treasuryWallet.isActive;
    }

    function getTreasuryWallets()
        external
        view
        returns (IDerampStorage.TreasuryWallet[] memory)
    {
        address[] memory walletsList = storageContract.getTreasuryWalletsList();
        IDerampStorage.TreasuryWallet[]
            memory wallets = new IDerampStorage.TreasuryWallet[](
                walletsList.length
            );
        for (uint256 i = 0; i < walletsList.length; i++) {
            wallets[i] = storageContract.getTreasuryWallet(walletsList[i]);
        }
        return wallets;
    }

    // === SIMPLIFIED WITHDRAWAL FUNCTIONS ===

    function getServiceFeeWithdrawalIndices()
        external
        view
        returns (uint256[] memory)
    {
        return storageContract.getServiceFeeWithdrawals();
    }

    function getServiceFeeWithdrawals()
        external
        view
        returns (IDerampStorage.WithdrawalRecord[] memory)
    {
        uint256[] memory indices = storageContract.getServiceFeeWithdrawals();
        IDerampStorage.WithdrawalRecord[] memory history = storageContract
            .getWithdrawalHistory();
        IDerampStorage.WithdrawalRecord[]
            memory result = new IDerampStorage.WithdrawalRecord[](
                indices.length
            );

        for (uint256 i = 0; i < indices.length; i++) {
            result[i] = history[indices[i]];
        }

        return result;
    }

    function getRecentServiceFeeWithdrawals(
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        uint256[] memory indices = storageContract.getServiceFeeWithdrawals();
        uint256 totalWithdrawals = indices.length;

        if (totalWithdrawals == 0) {
            return new IDerampStorage.WithdrawalRecord[](0);
        }

        uint256 resultSize = limit > totalWithdrawals
            ? totalWithdrawals
            : limit;
        IDerampStorage.WithdrawalRecord[]
            memory result = new IDerampStorage.WithdrawalRecord[](resultSize);
        IDerampStorage.WithdrawalRecord[] memory history = storageContract
            .getWithdrawalHistory();

        for (uint256 i = 0; i < resultSize; i++) {
            uint256 withdrawalIndex = indices[totalWithdrawals - 1 - i];
            result[i] = history[withdrawalIndex];
        }

        return result;
    }

    function getTreasuryWithdrawalIndices(
        address treasuryWallet
    ) external view returns (uint256[] memory) {
        return storageContract.getTreasuryWithdrawals(treasuryWallet);
    }

    function getTreasuryWithdrawals(
        address treasuryWallet
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        uint256[] memory indices = storageContract.getTreasuryWithdrawals(
            treasuryWallet
        );
        IDerampStorage.WithdrawalRecord[] memory history = storageContract
            .getWithdrawalHistory();
        IDerampStorage.WithdrawalRecord[]
            memory result = new IDerampStorage.WithdrawalRecord[](
                indices.length
            );

        for (uint256 i = 0; i < indices.length; i++) {
            result[i] = history[indices[i]];
        }

        return result;
    }

    function getRecentTreasuryWithdrawals(
        address treasuryWallet,
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        uint256[] memory indices = storageContract.getTreasuryWithdrawals(
            treasuryWallet
        );
        uint256 totalWithdrawals = indices.length;

        if (totalWithdrawals == 0) {
            return new IDerampStorage.WithdrawalRecord[](0);
        }

        uint256 resultSize = limit > totalWithdrawals
            ? totalWithdrawals
            : limit;
        IDerampStorage.WithdrawalRecord[]
            memory result = new IDerampStorage.WithdrawalRecord[](resultSize);
        IDerampStorage.WithdrawalRecord[] memory history = storageContract
            .getWithdrawalHistory();

        for (uint256 i = 0; i < resultSize; i++) {
            uint256 withdrawalIndex = indices[totalWithdrawals - 1 - i];
            result[i] = history[withdrawalIndex];
        }

        return result;
    }

    function getServiceFeeWithdrawalStats()
        external
        view
        returns (
            uint256 totalWithdrawals,
            uint256[] memory totalAmountByToken,
            address[] memory tokens,
            address[] memory treasuryWalletList,
            uint256[][] memory amountsByTreasury
        )
    {
        uint256[] memory indices = storageContract.getServiceFeeWithdrawals();
        totalWithdrawals = indices.length;

        // Simplified implementation - return empty arrays for complex analytics
        tokens = new address[](0);
        totalAmountByToken = new uint256[](0);
        treasuryWalletList = new address[](0);
        amountsByTreasury = new uint256[][](0);
    }

    // === ADMIN FUNCTIONS ===

    function pause() external onlyProxy {
        _pause();
    }

    function unpause() external onlyProxy {
        _unpause();
    }
}
