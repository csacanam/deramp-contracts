// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title InvoiceManager
 * @notice Handles invoice creation, management, and queries for the Deramp system.
 *
 * @dev Responsibilities:
 * - Manages invoice lifecycle (creation, payment, cancellation, status updates).
 * - Handles payment options and invoice metadata.
 * - Exposes queries for invoices by commerce, status, and date.
 *
 * Upgradeability:
 * - All invoice logic should reside here for easy upgrades.
 * - Only the proxy or authorized modules should interact with this contract.
 *
 * Security:
 * - Enforces access control for invoice creation and updates.
 * - Only the proxy or authorized users can create/cancel invoices.
 *
 * Recommendations:
 * - Document all invoice fields and their intended use.
 * - Keep invoice logic isolated from unrelated business logic.
 */
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IInvoiceManager.sol";
import "../interfaces/IAccessManager.sol";
import "../interfaces/IDerampStorage.sol";

contract InvoiceManager is Pausable, IInvoiceManager {
    IDerampStorage public immutable storageContract;
    IAccessManager public immutable accessManager;
    address public immutable proxy;

    modifier onlyOwner() {
        require(
            accessManager.hasRole(
                accessManager.getDefaultAdminRole(),
                msg.sender
            ),
            "Not owner [IM]"
        );
        _;
    }

    modifier onlyInvoiceCommerce(bytes32 invoiceId) {
        IDerampStorage.Invoice memory inv = storageContract.getInvoice(
            invoiceId
        );
        require(inv.id != bytes32(0), "Invoice not found [IM]");
        require(msg.sender == inv.commerce, "Not the invoice commerce [IM]");
        _;
    }

    modifier onlyProxy() {
        require(msg.sender == proxy, "Only proxy can call [IM]");
        _;
    }

    constructor(address _storage, address _accessManager, address _proxy) {
        storageContract = IDerampStorage(_storage);
        accessManager = IAccessManager(_accessManager);
        proxy = _proxy;
    }

    // === INVOICE CREATION ===

    function createInvoice(
        bytes32 id,
        address commerce,
        IDerampStorage.PaymentOption[] calldata paymentOptions,
        uint256 expiresAt
    ) external onlyProxy {
        require(
            storageContract.getInvoice(id).id == bytes32(0),
            "Invoice already exists [IM]"
        );
        require(commerce != address(0), "Invalid commerce [IM]");
        require(
            accessManager.isCommerceWhitelisted(commerce),
            "Commerce not whitelisted [IM]"
        );
        require(
            paymentOptions.length > 0,
            "At least one payment option required [IM]"
        );

        // Validate all payment options
        for (uint256 i = 0; i < paymentOptions.length; i++) {
            require(
                accessManager.isTokenWhitelisted(paymentOptions[i].token),
                "Token not whitelisted [IM]"
            );
            require(
                storageContract.isTokenWhitelistedForCommerce(
                    commerce,
                    paymentOptions[i].token
                ),
                "Token not whitelisted for this commerce [IM]"
            );
            require(
                paymentOptions[i].amount > 0,
                "Amount must be greater than 0 [IM]"
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
            expiredAt: 0,
            serviceFee: 0
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

    // === INVOICE MANAGEMENT ===

    function cancelInvoice(bytes32 id) external onlyProxy {
        IDerampStorage.Invoice memory inv = storageContract.getInvoice(id);
        require(inv.id != bytes32(0), "Invoice not found [IM]");
        require(
            inv.status == IDerampStorage.Status.PENDING,
            "Only pending invoices can be cancelled [IM]"
        );

        IDerampStorage.Invoice memory updatedInvoice = inv;
        updatedInvoice.status = IDerampStorage.Status.EXPIRED;
        updatedInvoice.expiredAt = block.timestamp;

        storageContract.setInvoice(id, updatedInvoice);
        emit IDerampStorage.InvoiceCancelled(id, inv.commerce);
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
        bytes32[] memory allInvoices = storageContract.getCommerceInvoices(
            commerce
        );
        address[] memory tempTokens = new address[](allInvoices.length);
        uint256 uniqueCount = 0;

        for (uint256 i = 0; i < allInvoices.length; i++) {
            IDerampStorage.Invoice memory inv = storageContract.getInvoice(
                allInvoices[i]
            );
            if (
                inv.status == IDerampStorage.Status.PAID &&
                inv.paidToken != address(0)
            ) {
                // Check if token is already in the array
                bool exists = false;
                for (uint256 j = 0; j < uniqueCount; j++) {
                    if (tempTokens[j] == inv.paidToken) {
                        exists = true;
                        break;
                    }
                }

                // Add token if it's not already in the array
                if (!exists) {
                    tempTokens[uniqueCount] = inv.paidToken;
                    uniqueCount++;
                }
            }
        }

        // Create result array with exact size
        address[] memory result = new address[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            result[i] = tempTokens[i];
        }

        return result;
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
        bytes32[] memory allInvoices = storageContract.getCommerceInvoices(
            commerce
        );
        uint256 feePercent = storageContract.commerceFees(commerce);
        if (feePercent == 0) {
            feePercent = storageContract.defaultFeePercent();
        }

        for (uint256 i = 0; i < allInvoices.length; i++) {
            IDerampStorage.Invoice memory inv = storageContract.getInvoice(
                allInvoices[i]
            );
            if (
                inv.status == IDerampStorage.Status.PAID &&
                inv.paidToken == token
            ) {
                totalRevenue += inv.paidAmount;
                netRevenue += (inv.paidAmount - inv.serviceFee);
            }
        }
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
        tokens = this.getCommerceTokens(commerce);
        totalRevenues = new uint256[](tokens.length);
        netRevenues = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            (totalRevenues[i], netRevenues[i]) = this.getCommerceRevenue(
                commerce,
                tokens[i]
            );
        }
    }
}
