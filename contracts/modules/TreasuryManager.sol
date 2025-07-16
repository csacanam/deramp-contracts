// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TreasuryManager
 * @notice Handles treasury wallet management and service fee withdrawals for the Deramp system.
 *
 * @dev Responsibilities:
 * - Manages treasury wallets (add, remove, update, status).
 * - Handles service fee withdrawals and statistics.
 * - Exposes queries for treasury wallets and service fee analytics.
 *
 * Upgradeability:
 * - All treasury logic should reside here for easy upgrades.
 * - Only the proxy or authorized modules should interact with this contract.
 *
 * Security:
 * - Enforces access control for treasury actions.
 * - Only the proxy or authorized users can manage treasury wallets and fees.
 *
 * Recommendations:
 * - Document all treasury wallet operations and service fee flows.
 * - Keep treasury logic isolated from unrelated business logic.
 */
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
        require(wallet != address(0), "Invalid wallet address [TM]");

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

    function updateTreasuryWallet(
        address wallet,
        IDerampStorage.TreasuryWallet calldata updatedWallet
    ) external onlyProxy {
        storageContract.updateTreasuryWallet(wallet, updatedWallet);
        emit IDerampStorage.TreasuryWalletUpdated(
            wallet,
            updatedWallet.description
        );
    }

    // === SERVICE FEE WITHDRAWALS ===

    function withdrawServiceFeesToTreasury(
        address token,
        address to
    ) external onlyProxy {
        require(to != address(0), "Invalid treasury address [TM]");
        require(
            storageContract.getTreasuryWallet(to).isActive,
            "Treasury wallet not active [TM]"
        );
        uint256 amount = storageContract.getServiceFeeBalance(token);
        require(amount > 0, "No service fees to withdraw [TM]");

        storageContract.subtractServiceFeeBalance(token, amount);
        IERC20(token).safeTransfer(to, amount);

        emit IDerampStorage.ServiceFeeWithdrawn(token, amount, to);
    }

    function withdrawAllServiceFeesToTreasury(
        address[] calldata tokens,
        address to
    ) external onlyProxy {
        require(to != address(0), "Invalid treasury address [TM]");
        require(
            storageContract.getTreasuryWallet(to).isActive,
            "Treasury wallet not active [TM]"
        );
        require(tokens.length > 0, "No tokens provided [TM]");
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

        require(totalWithdrawn > 0, "No service fees to withdraw [TM]");
    }

    function withdrawAllServiceFeesToTreasury(address to) external onlyProxy {
        require(to != address(0), "Invalid treasury address [TM]");
        require(
            storageContract.getTreasuryWallet(to).isActive,
            "Treasury wallet not active [TM]"
        );

        // Get all whitelisted tokens
        address[] memory whitelistedTokens = storageContract
            .getWhitelistedTokens();
        require(whitelistedTokens.length > 0, "No whitelisted tokens [TM]");

        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < whitelistedTokens.length; i++) {
            uint256 amount = storageContract.getServiceFeeBalance(
                whitelistedTokens[i]
            );
            if (amount > 0) {
                storageContract.subtractServiceFeeBalance(
                    whitelistedTokens[i],
                    amount
                );
                IERC20(whitelistedTokens[i]).safeTransfer(to, amount);
                emit IDerampStorage.ServiceFeeWithdrawn(
                    whitelistedTokens[i],
                    amount,
                    to
                );
                totalWithdrawn++;
            }
        }

        require(totalWithdrawn > 0, "No service fees to withdraw [TM]");
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

    /**
     * @notice Returns general statistics for service fee (treasury) withdrawals.
     * @dev The return format is designed to be easily consumed by the frontend.
     * @return totalWithdrawals Total number of service fee withdrawals performed.
     * @return totalAmountByToken Array parallel to 'tokens', where each element is the total withdrawn for that token.
     * @return tokens Array of unique token addresses withdrawn.
     * @return treasuryWalletList Array of unique wallet addresses that received withdrawals.
     * @return amountsByTreasury Matrix [wallet][token]:
     *         - amountsByTreasury[i][j] is the total withdrawn by treasuryWalletList[i] for token tokens[j].
     */
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
        if (totalWithdrawals == 0) {
            return (
                0,
                new uint256[](0),
                new address[](0),
                new address[](0),
                new uint256[][](0)
            );
        }
        // Temporary arrays for unique tokens and wallets
        address[] memory tempTokens = new address[](totalWithdrawals);
        uint256 tokenCount = 0;
        address[] memory tempWallets = new address[](totalWithdrawals);
        uint256 walletCount = 0;
        // Discover unique tokens and wallets
        for (uint256 i = 0; i < totalWithdrawals; i++) {
            IDerampStorage.WithdrawalRecord memory w = storageContract
                .getWithdrawalHistory()[indices[i]];
            // Unique token
            bool tokenExists = false;
            for (uint256 t = 0; t < tokenCount; t++) {
                if (tempTokens[t] == w.token) {
                    tokenExists = true;
                    break;
                }
            }
            if (!tokenExists) {
                tempTokens[tokenCount] = w.token;
                tokenCount++;
            }
            // Unique wallet
            bool walletExists = false;
            for (uint256 widx = 0; widx < walletCount; widx++) {
                if (tempWallets[widx] == w.to) {
                    walletExists = true;
                    break;
                }
            }
            if (!walletExists) {
                tempWallets[walletCount] = w.to;
                walletCount++;
            }
        }
        // Copy to final arrays
        tokens = new address[](tokenCount);
        for (uint256 i = 0; i < tokenCount; i++) {
            tokens[i] = tempTokens[i];
        }
        treasuryWalletList = new address[](walletCount);
        for (uint256 i = 0; i < walletCount; i++) {
            treasuryWalletList[i] = tempWallets[i];
        }
        // Initialize accumulators
        totalAmountByToken = new uint256[](tokenCount);
        amountsByTreasury = new uint256[][](walletCount);
        for (uint256 i = 0; i < walletCount; i++) {
            amountsByTreasury[i] = new uint256[](tokenCount);
        }
        // Accumulate amounts
        for (uint256 i = 0; i < totalWithdrawals; i++) {
            IDerampStorage.WithdrawalRecord memory w = storageContract
                .getWithdrawalHistory()[indices[i]];
            // Find token index
            uint256 tIdx = 0;
            for (; tIdx < tokenCount; tIdx++) {
                if (tokens[tIdx] == w.token) break;
            }
            // Find wallet index
            uint256 wIdx = 0;
            for (; wIdx < walletCount; wIdx++) {
                if (treasuryWalletList[wIdx] == w.to) break;
            }
            totalAmountByToken[tIdx] += w.amount;
            amountsByTreasury[wIdx][tIdx] += w.amount;
        }
        return (
            totalWithdrawals,
            totalAmountByToken,
            tokens,
            treasuryWalletList,
            amountsByTreasury
        );
    }
}
