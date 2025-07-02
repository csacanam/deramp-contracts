// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IWithdrawalManager.sol";
import "../interfaces/IAccessManager.sol";
import "../interfaces/IDerampStorage.sol";

contract WithdrawalManager is Pausable, IWithdrawalManager {
    using SafeERC20 for IERC20;

    IDerampStorage public immutable storageContract;
    IAccessManager public immutable accessManager;

    modifier onlyCommerce() {
        require(
            accessManager.isCommerceWhitelisted(msg.sender),
            "Not whitelisted commerce"
        );
        _;
    }

    modifier onlyOwner() {
        require(
            accessManager.hasRole(
                accessManager.getDefaultAdminRole(),
                msg.sender
            ),
            "Not owner"
        );
        _;
    }

    constructor(address _storage, address _accessManager) {
        storageContract = IDerampStorage(_storage);
        accessManager = IAccessManager(_accessManager);
    }

    // === COMMERCE WITHDRAWALS ===

    function withdraw(address token) external onlyCommerce whenNotPaused {
        uint256 amount = storageContract.balances(msg.sender, token);
        require(amount > 0, "No funds");

        // Update balance
        storageContract.subtractFromBalance(msg.sender, token, amount);

        // Transfer tokens
        IERC20(token).safeTransfer(msg.sender, amount);

        // Create withdrawal record
        IDerampStorage.WithdrawalRecord memory record = IDerampStorage
            .WithdrawalRecord({
                token: token,
                amount: amount,
                to: msg.sender,
                initiatedBy: msg.sender,
                withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                createdAt: block.timestamp,
                invoiceId: bytes32(0)
            });

        uint256 index = storageContract.addWithdrawalRecord(record);
        storageContract.addCommerceWithdrawal(msg.sender, index);

        emit IDerampStorage.Withdrawn(msg.sender, token, amount);
    }

    function withdrawAll(
        address[] calldata tokens
    ) external onlyCommerce whenNotPaused {
        require(tokens.length > 0, "No tokens provided");
        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = storageContract.balances(msg.sender, token);

            if (amount == 0) {
                continue;
            }

            // Update balance
            storageContract.subtractFromBalance(msg.sender, token, amount);

            // Transfer tokens
            IERC20(token).safeTransfer(msg.sender, amount);

            // Create withdrawal record
            IDerampStorage.WithdrawalRecord memory record = IDerampStorage
                .WithdrawalRecord({
                    token: token,
                    amount: amount,
                    to: msg.sender,
                    initiatedBy: msg.sender,
                    withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                    createdAt: block.timestamp,
                    invoiceId: bytes32(0)
                });

            uint256 index = storageContract.addWithdrawalRecord(record);
            storageContract.addCommerceWithdrawal(msg.sender, index);

            emit IDerampStorage.Withdrawn(msg.sender, token, amount);
            totalWithdrawn++;
        }

        require(totalWithdrawn > 0, "No funds to withdraw");
    }

    function withdrawCommerceBalanceForInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount
    ) external onlyCommerce whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(
            storageContract.balances(msg.sender, token) >= amount,
            "Insufficient balance"
        );

        // Verify invoice belongs to commerce
        IDerampStorage.Invoice memory invoice = storageContract.getInvoice(
            invoiceId
        );
        require(
            invoice.commerce == msg.sender,
            "Invoice does not belong to commerce"
        );

        // Update balance
        storageContract.subtractCommerceBalance(msg.sender, token, amount);

        // Transfer tokens
        IERC20(token).safeTransfer(msg.sender, amount);

        // Create withdrawal record with invoice reference
        IDerampStorage.WithdrawalRecord memory record = IDerampStorage
            .WithdrawalRecord({
                token: token,
                amount: amount,
                to: msg.sender,
                initiatedBy: msg.sender,
                withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                createdAt: block.timestamp,
                invoiceId: invoiceId
            });

        storageContract.addWithdrawalRecord(record);

        emit IDerampStorage.CommerceWithdrawal(msg.sender, token, amount);
    }

    function withdrawCommerceBalance(
        address token,
        uint256 amount,
        address to
    ) external onlyCommerce whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(to != address(0), "Invalid recipient");
        require(
            storageContract.balances(msg.sender, token) >= amount,
            "Insufficient balance"
        );

        // Update balance
        storageContract.subtractCommerceBalance(msg.sender, token, amount);

        // Transfer tokens
        IERC20(token).safeTransfer(to, amount);

        // Create withdrawal record
        IDerampStorage.WithdrawalRecord memory record = IDerampStorage
            .WithdrawalRecord({
                token: token,
                amount: amount,
                to: to,
                initiatedBy: msg.sender,
                withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                createdAt: block.timestamp,
                invoiceId: bytes32(0)
            });

        storageContract.addWithdrawalRecord(record);

        emit IDerampStorage.CommerceWithdrawal(msg.sender, token, amount);
    }

    function withdrawAllCommerceBalance(
        address token
    ) external onlyCommerce whenNotPaused {
        uint256 balance = storageContract.balances(msg.sender, token);
        require(balance > 0, "No balance to withdraw");

        // Inline withdrawCommerceBalance logic
        require(
            storageContract.balances(msg.sender, token) >= balance,
            "Insufficient balance"
        );

        // Update balance
        storageContract.subtractCommerceBalance(msg.sender, token, balance);

        // Transfer tokens
        IERC20(token).safeTransfer(msg.sender, balance);

        // Create withdrawal record
        IDerampStorage.WithdrawalRecord memory record = IDerampStorage
            .WithdrawalRecord({
                token: token,
                amount: balance,
                to: msg.sender,
                initiatedBy: msg.sender,
                withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                createdAt: block.timestamp,
                invoiceId: bytes32(0)
            });

        storageContract.addWithdrawalRecord(record);

        emit IDerampStorage.CommerceWithdrawal(msg.sender, token, balance);
    }

    function withdrawMultipleCommerceBalances(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external onlyCommerce whenNotPaused {
        require(tokens.length == amounts.length, "Array length mismatch");

        for (uint256 i = 0; i < tokens.length; i++) {
            // Inline withdrawCommerceBalance logic
            require(amounts[i] > 0, "Amount must be greater than 0");
            require(
                storageContract.balances(msg.sender, tokens[i]) >= amounts[i],
                "Insufficient balance"
            );

            // Update balance
            storageContract.subtractCommerceBalance(
                msg.sender,
                tokens[i],
                amounts[i]
            );

            // Transfer tokens
            IERC20(tokens[i]).safeTransfer(msg.sender, amounts[i]);

            // Create withdrawal record
            IDerampStorage.WithdrawalRecord memory record = IDerampStorage
                .WithdrawalRecord({
                    token: tokens[i],
                    amount: amounts[i],
                    to: msg.sender,
                    initiatedBy: msg.sender,
                    withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                    createdAt: block.timestamp,
                    invoiceId: bytes32(0)
                });

            storageContract.addWithdrawalRecord(record);

            emit IDerampStorage.CommerceWithdrawal(
                msg.sender,
                tokens[i],
                amounts[i]
            );
        }
    }

    function withdrawAllCommerceBalances(
        address[] calldata tokens
    ) external onlyCommerce whenNotPaused {
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 balance = storageContract.balances(msg.sender, tokens[i]);
            if (balance > 0) {
                // Inline withdrawCommerceBalance logic
                require(
                    storageContract.balances(msg.sender, tokens[i]) >= balance,
                    "Insufficient balance"
                );

                // Update balance
                storageContract.subtractCommerceBalance(
                    msg.sender,
                    tokens[i],
                    balance
                );

                // Transfer tokens
                IERC20(tokens[i]).safeTransfer(msg.sender, balance);

                // Create withdrawal record
                IDerampStorage.WithdrawalRecord memory record = IDerampStorage
                    .WithdrawalRecord({
                        token: tokens[i],
                        amount: balance,
                        to: msg.sender,
                        initiatedBy: msg.sender,
                        withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                        createdAt: block.timestamp,
                        invoiceId: bytes32(0)
                    });

                storageContract.addWithdrawalRecord(record);

                emit IDerampStorage.CommerceWithdrawal(
                    msg.sender,
                    tokens[i],
                    balance
                );
            }
        }
    }

    // === ADMIN WITHDRAWALS ===

    function adminWithdrawCommerceBalance(
        address commerce,
        address token,
        uint256 amount,
        address to
    ) external onlyOwner whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(to != address(0), "Invalid recipient");
        require(
            storageContract.balances(commerce, token) >= amount,
            "Insufficient balance"
        );

        // Update balance
        storageContract.subtractCommerceBalance(commerce, token, amount);

        // Transfer tokens
        IERC20(token).safeTransfer(to, amount);

        // Create withdrawal record
        IDerampStorage.WithdrawalRecord memory record = IDerampStorage
            .WithdrawalRecord({
                token: token,
                amount: amount,
                to: to,
                initiatedBy: msg.sender,
                withdrawalType: IDerampStorage.WithdrawalType.COMMERCE,
                createdAt: block.timestamp,
                invoiceId: bytes32(0)
            });

        storageContract.addWithdrawalRecord(record);

        emit IDerampStorage.CommerceWithdrawal(commerce, token, amount);
    }

    // === WITHDRAWAL QUERIES ===

    function getWithdrawalCount() external view returns (uint256) {
        return storageContract.getWithdrawalHistory().length;
    }

    function getWithdrawal(
        uint256 index
    ) external view returns (IDerampStorage.WithdrawalRecord memory) {
        IDerampStorage.WithdrawalRecord[] memory history = storageContract
            .getWithdrawalHistory();
        require(index < history.length, "Withdrawal index out of bounds");
        return history[index];
    }

    function getMultipleWithdrawals(
        uint256[] calldata indices
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        IDerampStorage.WithdrawalRecord[] memory history = storageContract
            .getWithdrawalHistory();
        IDerampStorage.WithdrawalRecord[]
            memory result = new IDerampStorage.WithdrawalRecord[](
                indices.length
            );

        for (uint256 i = 0; i < indices.length; i++) {
            require(
                indices[i] < history.length,
                "Withdrawal index out of bounds"
            );
            result[i] = history[indices[i]];
        }

        return result;
    }

    function getCommerceWithdrawalIndices(
        address commerce
    ) external view returns (uint256[] memory) {
        return storageContract.getCommerceWithdrawals(commerce);
    }

    function getRecentCommerceWithdrawals(
        address commerce,
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        uint256[] memory indices = storageContract.getCommerceWithdrawals(
            commerce
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

        // Return from most recent to oldest
        for (uint256 i = 0; i < resultSize; i++) {
            uint256 withdrawalIndex = indices[totalWithdrawals - 1 - i];
            result[i] = history[withdrawalIndex];
        }

        return result;
    }

    function recordWithdrawal(
        address token,
        uint256 amount,
        address to,
        IDerampStorage.WithdrawalType withdrawalType,
        bytes32 invoiceId
    ) external onlyOwner {
        IDerampStorage.WithdrawalRecord memory record = IDerampStorage
            .WithdrawalRecord({
                token: token,
                amount: amount,
                to: to,
                initiatedBy: msg.sender,
                withdrawalType: withdrawalType,
                createdAt: block.timestamp,
                invoiceId: invoiceId
            });

        uint256 index = storageContract.addWithdrawalRecord(record);

        if (withdrawalType == IDerampStorage.WithdrawalType.COMMERCE) {
            storageContract.addCommerceWithdrawal(to, index);
        } else if (
            withdrawalType == IDerampStorage.WithdrawalType.SERVICE_FEE
        ) {
            storageContract.addServiceFeeWithdrawal(index);
            storageContract.addTreasuryWithdrawal(to, index);
        }

        // Return value removed to match interface
    }

    function getWithdrawalHistory()
        external
        view
        returns (IDerampStorage.WithdrawalRecord[] memory)
    {
        return storageContract.getWithdrawalHistory();
    }

    function getCommerceWithdrawals(
        address commerce
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        uint256[] memory indices = storageContract.getCommerceWithdrawals(
            commerce
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

    function getWithdrawalsByType(
        IDerampStorage.WithdrawalType withdrawalType
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        IDerampStorage.WithdrawalRecord[]
            memory allWithdrawals = storageContract.getWithdrawalHistory();
        IDerampStorage.WithdrawalRecord[]
            memory tempResults = new IDerampStorage.WithdrawalRecord[](
                allWithdrawals.length
            );
        uint256 count = 0;

        for (uint256 i = 0; i < allWithdrawals.length; i++) {
            if (allWithdrawals[i].withdrawalType == withdrawalType) {
                tempResults[count] = allWithdrawals[i];
                count++;
            }
        }

        IDerampStorage.WithdrawalRecord[]
            memory results = new IDerampStorage.WithdrawalRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = tempResults[i];
        }

        return results;
    }

    function getWithdrawalsByToken(
        address token
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        IDerampStorage.WithdrawalRecord[]
            memory allWithdrawals = storageContract.getWithdrawalHistory();
        IDerampStorage.WithdrawalRecord[]
            memory tempResults = new IDerampStorage.WithdrawalRecord[](
                allWithdrawals.length
            );
        uint256 count = 0;

        for (uint256 i = 0; i < allWithdrawals.length; i++) {
            if (allWithdrawals[i].token == token) {
                tempResults[count] = allWithdrawals[i];
                count++;
            }
        }

        IDerampStorage.WithdrawalRecord[]
            memory results = new IDerampStorage.WithdrawalRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = tempResults[i];
        }

        return results;
    }

    function getRecentWithdrawals(
        uint256 limit
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        IDerampStorage.WithdrawalRecord[]
            memory allWithdrawals = storageContract.getWithdrawalHistory();
        uint256 totalWithdrawals = allWithdrawals.length;

        if (totalWithdrawals == 0) {
            return new IDerampStorage.WithdrawalRecord[](0);
        }

        uint256 resultSize = limit > totalWithdrawals
            ? totalWithdrawals
            : limit;
        IDerampStorage.WithdrawalRecord[]
            memory result = new IDerampStorage.WithdrawalRecord[](resultSize);

        // Return from most recent to oldest
        for (uint256 i = 0; i < resultSize; i++) {
            result[i] = allWithdrawals[totalWithdrawals - 1 - i];
        }

        return result;
    }

    function getWithdrawalsByDateRange(
        uint256 fromTimestamp,
        uint256 toTimestamp
    ) external view returns (IDerampStorage.WithdrawalRecord[] memory) {
        IDerampStorage.WithdrawalRecord[]
            memory allWithdrawals = storageContract.getWithdrawalHistory();
        IDerampStorage.WithdrawalRecord[]
            memory tempResults = new IDerampStorage.WithdrawalRecord[](
                allWithdrawals.length
            );
        uint256 count = 0;

        for (uint256 i = 0; i < allWithdrawals.length; i++) {
            if (
                allWithdrawals[i].createdAt >= fromTimestamp &&
                allWithdrawals[i].createdAt <= toTimestamp
            ) {
                tempResults[count] = allWithdrawals[i];
                count++;
            }
        }

        IDerampStorage.WithdrawalRecord[]
            memory results = new IDerampStorage.WithdrawalRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = tempResults[i];
        }

        return results;
    }

    // === WITHDRAWAL STATISTICS ===

    function getCommerceWithdrawalStats(
        address commerce
    )
        external
        view
        returns (
            uint256 totalWithdrawals,
            uint256[] memory totalAmountByToken,
            address[] memory tokens
        )
    {
        uint256[] memory indices = storageContract.getCommerceWithdrawals(
            commerce
        );
        IDerampStorage.WithdrawalRecord[] memory history = storageContract
            .getWithdrawalHistory();
        IDerampStorage.WithdrawalRecord[]
            memory withdrawals = new IDerampStorage.WithdrawalRecord[](
                indices.length
            );

        for (uint256 i = 0; i < indices.length; i++) {
            withdrawals[i] = history[indices[i]];
        }
        totalWithdrawals = withdrawals.length;

        // Count unique tokens and their amounts
        address[] memory tempTokens = new address[](withdrawals.length);
        uint256[] memory tempAmounts = new uint256[](withdrawals.length);
        uint256 uniqueTokens = 0;

        for (uint256 i = 0; i < withdrawals.length; i++) {
            bool found = false;
            for (uint256 j = 0; j < uniqueTokens; j++) {
                if (tempTokens[j] == withdrawals[i].token) {
                    tempAmounts[j] += withdrawals[i].amount;
                    found = true;
                    break;
                }
            }
            if (!found) {
                tempTokens[uniqueTokens] = withdrawals[i].token;
                tempAmounts[uniqueTokens] = withdrawals[i].amount;
                uniqueTokens++;
            }
        }

        tokens = new address[](uniqueTokens);
        totalAmountByToken = new uint256[](uniqueTokens);
        for (uint256 i = 0; i < uniqueTokens; i++) {
            tokens[i] = tempTokens[i];
            totalAmountByToken[i] = tempAmounts[i];
        }
    }

    function getTotalWithdrawalsByToken(
        address token
    ) external view returns (uint256 totalAmount, uint256 totalCount) {
        IDerampStorage.WithdrawalRecord[]
            memory allWithdrawals = storageContract.getWithdrawalHistory();

        for (uint256 i = 0; i < allWithdrawals.length; i++) {
            if (allWithdrawals[i].token == token) {
                totalAmount += allWithdrawals[i].amount;
                totalCount++;
            }
        }
    }

    // === BALANCE QUERIES ===

    function getCommerceBalance(
        address commerce,
        address token
    ) external view returns (uint256) {
        return storageContract.balances(commerce, token);
    }

    function getCommerceBalances(
        address commerce,
        address[] calldata tokens
    ) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = storageContract.balances(commerce, tokens[i]);
        }
        return balances;
    }

    // === ADMIN FUNCTIONS ===

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
