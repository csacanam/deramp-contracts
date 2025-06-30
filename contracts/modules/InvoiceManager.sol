// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IInvoiceManager.sol";
import "../interfaces/IAccessManager.sol";
import "../storage/DerampStorage.sol";

contract InvoiceManager is Pausable, IInvoiceManager {
    DerampStorage public immutable storageContract;
    IAccessManager public immutable accessManager;

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    modifier onlyOwner() {
        require(
            accessManager.hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not owner"
        );
        _;
    }

    modifier onlyInvoiceCommerce(bytes32 invoiceId) {
        IDerampStorage.Invoice memory inv = storageContract.getInvoice(
            invoiceId
        );
        require(inv.id != bytes32(0), "Invoice not found");
        require(msg.sender == inv.commerce, "Not the invoice commerce");
        _;
    }

    constructor(address _storage, address _accessManager) {
        storageContract = DerampStorage(_storage);
        accessManager = IAccessManager(_accessManager);
    }

    // === INVOICE CREATION ===

    function createInvoice(
        bytes32 id,
        address commerce,
        IDerampStorage.PaymentOption[] calldata paymentOptions,
        uint256 expiresAt
    ) external onlyOwner whenNotPaused {
        require(
            storageContract.getInvoice(id).id == bytes32(0),
            "Invoice already exists"
        );
        require(commerce != address(0), "Invalid commerce");
        require(
            accessManager.isCommerceWhitelisted(commerce),
            "Commerce not whitelisted"
        );
        require(
            paymentOptions.length > 0,
            "At least one payment option required"
        );

        // Validate all payment options
        for (uint256 i = 0; i < paymentOptions.length; i++) {
            require(
                accessManager.isTokenWhitelisted(paymentOptions[i].token),
                "Token not whitelisted"
            );
            require(
                paymentOptions[i].amount > 0,
                "Amount must be greater than 0"
            );
        }

        IDerampStorage.Invoice memory invoice = IDerampStorage.Invoice({
            id: id,
            payer: address(0),
            commerce: commerce,
            paidToken: address(0),
            paidAmount: 0,
            status: IDerampStorage.Status.PENDING,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            paidAt: 0,
            refundedAt: 0,
            expiredAt: 0
        });

        storageContract.setInvoice(id, invoice);

        // Add all payment options
        for (uint256 i = 0; i < paymentOptions.length; i++) {
            storageContract.addPaymentOption(id, paymentOptions[i]);
        }

        // Track invoice for commerce
        storageContract.addCommerceInvoice(commerce, id);

        emit IDerampStorage.InvoiceCreated(id, commerce);
    }

    function createMultipleInvoices(
        bytes32[] calldata ids,
        address[] calldata commerces,
        IDerampStorage.PaymentOption[][] calldata paymentOptionsArray,
        uint256[] calldata expiresAtArray
    ) external onlyOwner whenNotPaused {
        require(ids.length == commerces.length, "Array length mismatch");
        require(
            ids.length == paymentOptionsArray.length,
            "Array length mismatch"
        );
        require(ids.length == expiresAtArray.length, "Array length mismatch");

        for (uint256 i = 0; i < ids.length; i++) {
            // Inline createInvoice logic
            require(
                storageContract.getInvoice(ids[i]).id == bytes32(0),
                "Invoice already exists"
            );
            require(commerces[i] != address(0), "Invalid commerce");
            require(
                accessManager.isCommerceWhitelisted(commerces[i]),
                "Commerce not whitelisted"
            );
            require(
                paymentOptionsArray[i].length > 0,
                "At least one payment option required"
            );

            // Validate all payment options
            for (uint256 j = 0; j < paymentOptionsArray[i].length; j++) {
                require(
                    accessManager.isTokenWhitelisted(
                        paymentOptionsArray[i][j].token
                    ),
                    "Token not whitelisted"
                );
                require(
                    paymentOptionsArray[i][j].amount > 0,
                    "Amount must be greater than 0"
                );
            }

            IDerampStorage.Invoice memory invoice = IDerampStorage.Invoice({
                id: ids[i],
                payer: address(0),
                commerce: commerces[i],
                paidToken: address(0),
                paidAmount: 0,
                status: IDerampStorage.Status.PENDING,
                createdAt: block.timestamp,
                expiresAt: expiresAtArray[i],
                paidAt: 0,
                refundedAt: 0,
                expiredAt: 0
            });

            storageContract.setInvoice(ids[i], invoice);

            // Add all payment options
            for (uint256 j = 0; j < paymentOptionsArray[i].length; j++) {
                storageContract.addPaymentOption(
                    ids[i],
                    paymentOptionsArray[i][j]
                );
            }

            // Track invoice for commerce
            storageContract.addCommerceInvoice(commerces[i], ids[i]);

            emit IDerampStorage.InvoiceCreated(ids[i], commerces[i]);
        }
    }

    // === INVOICE MANAGEMENT ===

    function cancelInvoice(bytes32 id) external {
        IDerampStorage.Invoice memory inv = storageContract.getInvoice(id);
        require(inv.id != bytes32(0), "Invoice not found");
        require(
            inv.status == IDerampStorage.Status.PENDING,
            "Only pending invoices can be cancelled"
        );
        require(
            msg.sender == inv.commerce ||
                accessManager.hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not authorized to cancel invoice"
        );

        IDerampStorage.Invoice memory updatedInvoice = inv;
        updatedInvoice.status = IDerampStorage.Status.EXPIRED;
        updatedInvoice.expiredAt = block.timestamp;

        storageContract.setInvoice(id, updatedInvoice);
        emit IDerampStorage.InvoiceCancelled(id, inv.commerce);
    }

    function expireInvoice(bytes32 id) external {
        IDerampStorage.Invoice memory inv = storageContract.getInvoice(id);
        require(inv.id != bytes32(0), "Invoice not found");
        require(
            inv.status == IDerampStorage.Status.PENDING,
            "Only pending invoices can be expired"
        );
        require(
            msg.sender == inv.commerce ||
                accessManager.hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not authorized to expire invoice"
        );

        IDerampStorage.Invoice memory updatedInvoice = inv;
        updatedInvoice.status = IDerampStorage.Status.EXPIRED;
        updatedInvoice.expiredAt = block.timestamp;

        storageContract.setInvoice(id, updatedInvoice);
        emit IDerampStorage.InvoiceExpired(id, inv.commerce);
    }

    // === INVOICE QUERIES ===

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
        )
    {
        IDerampStorage.Invoice memory inv = storageContract.getInvoice(id);
        return (
            inv.id,
            inv.payer,
            inv.commerce,
            inv.paidToken,
            inv.paidAmount,
            inv.status,
            inv.createdAt,
            inv.expiresAt,
            inv.paidAt,
            inv.refundedAt,
            inv.expiredAt
        );
    }

    function getInvoicePaymentOptions(
        bytes32 id
    ) external view returns (IDerampStorage.PaymentOption[] memory) {
        return storageContract.getInvoicePaymentOptions(id);
    }

    // === COMMERCE QUERIES ===

    function getCommerceInvoices(
        address commerce
    ) external view returns (bytes32[] memory) {
        return storageContract.getCommerceInvoices(commerce);
    }

    function getCommerceInvoiceCount(
        address commerce
    ) external view returns (uint256) {
        return storageContract.getCommerceInvoices(commerce).length;
    }

    function getCommerceInvoicesByStatus(
        address commerce,
        IDerampStorage.Status status
    ) external view returns (bytes32[] memory) {
        bytes32[] memory allInvoices = storageContract.getCommerceInvoices(
            commerce
        );
        bytes32[] memory tempResults = new bytes32[](allInvoices.length);
        uint256 count = 0;

        for (uint256 i = 0; i < allInvoices.length; i++) {
            IDerampStorage.Invoice memory inv = storageContract.getInvoice(
                allInvoices[i]
            );
            if (inv.status == status) {
                tempResults[count] = allInvoices[i];
                count++;
            }
        }

        bytes32[] memory results = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = tempResults[i];
        }

        return results;
    }

    function getRecentCommerceInvoices(
        address commerce,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        bytes32[] memory allInvoices = storageContract.getCommerceInvoices(
            commerce
        );
        uint256 totalInvoices = allInvoices.length;

        if (totalInvoices == 0) {
            return new bytes32[](0);
        }

        uint256 resultSize = limit > totalInvoices ? totalInvoices : limit;
        bytes32[] memory result = new bytes32[](resultSize);

        // Return from most recent (last added) to oldest
        for (uint256 i = 0; i < resultSize; i++) {
            result[i] = allInvoices[totalInvoices - 1 - i];
        }

        return result;
    }

    // === BATCH QUERIES ===

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
        )
    {
        uint256 length = invoiceIds.length;

        ids = new bytes32[](length);
        payers = new address[](length);
        commerces = new address[](length);
        paidTokens = new address[](length);
        paidAmounts = new uint256[](length);
        statuses = new IDerampStorage.Status[](length);
        createdAts = new uint256[](length);
        expiresAts = new uint256[](length);
        paidAts = new uint256[](length);
        refundedAts = new uint256[](length);
        expiredAts = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            IDerampStorage.Invoice memory inv = storageContract.getInvoice(
                invoiceIds[i]
            );
            ids[i] = inv.id;
            payers[i] = inv.payer;
            commerces[i] = inv.commerce;
            paidTokens[i] = inv.paidToken;
            paidAmounts[i] = inv.paidAmount;
            statuses[i] = inv.status;
            createdAts[i] = inv.createdAt;
            expiresAts[i] = inv.expiresAt;
            paidAts[i] = inv.paidAt;
            refundedAts[i] = inv.refundedAt;
            expiredAts[i] = inv.expiredAt;
        }
    }

    // === STATISTICS ===

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
        )
    {
        bytes32[] memory allInvoices = storageContract.getCommerceInvoices(
            commerce
        );
        totalInvoices = allInvoices.length;

        for (uint256 i = 0; i < allInvoices.length; i++) {
            IDerampStorage.Invoice memory inv = storageContract.getInvoice(
                allInvoices[i]
            );
            if (inv.status == IDerampStorage.Status.PENDING) {
                pendingInvoices++;
            } else if (inv.status == IDerampStorage.Status.PAID) {
                paidInvoices++;
            } else if (inv.status == IDerampStorage.Status.REFUNDED) {
                refundedInvoices++;
            } else if (inv.status == IDerampStorage.Status.EXPIRED) {
                expiredInvoices++;
            }
        }
    }

    // === VALIDATION ===

    function invoiceExists(bytes32 id) external view returns (bool) {
        return storageContract.getInvoice(id).id != bytes32(0);
    }

    function isInvoiceCommerce(
        bytes32 id,
        address commerce
    ) external view returns (bool) {
        IDerampStorage.Invoice memory inv = storageContract.getInvoice(id);
        return inv.id != bytes32(0) && inv.commerce == commerce;
    }

    // === COMMERCE ANALYTICS ===

    /// @notice Get unique tokens used in paid invoices for a commerce
    /// @param commerce The commerce address
    /// @return Array of unique token addresses used in paid invoices
    function getCommerceTokens(
        address commerce
    ) external view returns (address[] memory) {
        return storageContract.getCommerceTokens(commerce);
    }

    /// @notice Get commerce total revenue by token (only paid invoices)
    /// @param commerce The commerce address
    /// @param token The token address
    /// @return totalRevenue Total amount collected from paid invoices (before fees)
    /// @return netRevenue Net amount (after service fees)
    function getCommerceRevenue(
        address commerce,
        address token
    ) external view returns (uint256 totalRevenue, uint256 netRevenue) {
        return storageContract.getCommerceRevenue(commerce, token);
    }

    /// @notice Get commerce revenue for all tokens (only paid invoices)
    /// @param commerce The commerce address
    /// @return tokens Array of token addresses
    /// @return totalRevenues Array of total revenues per token (before fees)
    /// @return netRevenues Array of net revenues per token (after fees)
    function getCommerceAllRevenues(
        address commerce
    )
        external
        view
        returns (
            address[] memory tokens,
            uint256[] memory totalRevenues,
            uint256[] memory netRevenues
        )
    {
        return storageContract.getCommerceAllRevenues(commerce);
    }

    // === ADMIN FUNCTIONS ===

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
