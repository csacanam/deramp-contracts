// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDerampStorage {
    enum Status {
        PENDING,
        PAID,
        REFUNDED,
        EXPIRED
    }

    enum WithdrawalType {
        COMMERCE,
        SERVICE_FEE
    }

    struct PaymentOption {
        address token;
        uint256 amount;
    }

    struct Invoice {
        bytes32 id;
        address payer;
        address commerce;
        address paidToken;
        uint256 paidAmount;
        Status status;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 paidAt;
        uint256 refundedAt;
        uint256 expiredAt;
    }

    struct WithdrawalRecord {
        address token;
        uint256 amount;
        address to;
        address initiatedBy;
        WithdrawalType withdrawalType;
        uint256 createdAt;
        bytes32 invoiceId;
    }

    struct TreasuryWallet {
        address wallet;
        bool isActive;
        uint256 addedAt;
        string description;
    }

    // Events
    event InvoiceCreated(bytes32 indexed id, address indexed commerce);
    event InvoicePaid(
        bytes32 indexed id,
        address indexed payer,
        address indexed token,
        uint256 amount
    );
    event Withdrawn(
        address indexed commerce,
        address indexed token,
        uint256 amount
    );
    event CommerceWithdrawal(
        address indexed commerce,
        address indexed token,
        uint256 amount
    );
    event Refunded(
        bytes32 indexed id,
        address indexed payer,
        address indexed token,
        uint256 amount
    );
    event InvoiceExpired(bytes32 indexed id, address indexed commerce);
    event FeeCollected(
        bytes32 indexed invoiceId,
        address indexed commerce,
        address indexed token,
        uint256 feeAmount,
        uint256 feePercent
    );
    event ServiceFeeWithdrawn(
        address indexed token,
        uint256 amount,
        address indexed to
    );
    event ServiceFeeWithdrawal(
        address indexed to,
        address indexed token,
        uint256 amount
    );
    event TokenRescued(
        address indexed token,
        uint256 amount,
        address indexed to
    );
    event InvoiceCancelled(bytes32 indexed id, address indexed commerce);
    event TreasuryWalletAdded(address indexed wallet, string description);
    event TreasuryWalletRemoved(address indexed wallet);
    event TreasuryWalletStatusChanged(address indexed wallet, bool isActive);
    event TreasuryWalletUpdated(address indexed wallet, string description);
    event WithdrawalRecorded(
        uint256 indexed withdrawalIndex,
        address indexed token,
        uint256 amount,
        address indexed to,
        WithdrawalType withdrawalType
    );

    // View functions
    function getInvoice(bytes32 id) external view returns (Invoice memory);

    function getInvoicePaymentOptions(
        bytes32 id
    ) external view returns (PaymentOption[] memory);

    function getCommerceInvoices(
        address commerce
    ) external view returns (bytes32[] memory);

    function getTreasuryWalletsList() external view returns (address[] memory);

    function getWithdrawalHistory()
        external
        view
        returns (WithdrawalRecord[] memory);

    function getCommerceWithdrawals(
        address commerce
    ) external view returns (uint256[] memory);

    function getTreasuryWithdrawals(
        address treasury
    ) external view returns (uint256[] memory);

    function getServiceFeeWithdrawals()
        external
        view
        returns (uint256[] memory);

    // Analytics functions
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
