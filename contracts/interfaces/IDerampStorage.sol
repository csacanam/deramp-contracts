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
        uint256 serviceFee;
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

    // === MAPPINGS ACCESS ===
    function whitelistedTokens(address token) external view returns (bool);

    function whitelistedCommerces(
        address commerce
    ) external view returns (bool);

    function balances(
        address commerce,
        address token
    ) external view returns (uint256);

    function serviceFeeBalances(address token) external view returns (uint256);

    function commerceFees(address commerce) external view returns (uint256);

    function defaultFeePercent() external view returns (uint256);

    // === TOKEN WHITELIST MANAGEMENT ===
    function setWhitelistedToken(address token, bool whitelisted) external;

    function getWhitelistedTokens() external view returns (address[] memory);

    // === COMMERCE WHITELIST MANAGEMENT ===
    function setWhitelistedCommerce(
        address commerce,
        bool whitelisted
    ) external;

    // === FEE MANAGEMENT ===
    function setDefaultFeePercent(uint256 feePercent) external;

    function setCommerceFee(address commerce, uint256 feePercent) external;

    // === INVOICE MANAGEMENT ===
    function setInvoice(bytes32 id, Invoice calldata invoice) external;

    function addPaymentOption(
        bytes32 invoiceId,
        PaymentOption calldata option
    ) external;

    function clearPaymentOptions(bytes32 invoiceId) external;

    function addCommerceInvoice(address commerce, bytes32 invoiceId) external;

    // === INVOICE QUERIES ===
    function getInvoice(bytes32 id) external view returns (Invoice memory);

    function getInvoicePaymentOptions(
        bytes32 id
    ) external view returns (PaymentOption[] memory);

    function getCommerceInvoices(
        address commerce
    ) external view returns (bytes32[] memory);

    // === BALANCE MANAGEMENT ===
    function addToBalance(
        address commerce,
        address token,
        uint256 amount
    ) external;

    function subtractFromBalance(
        address commerce,
        address token,
        uint256 amount
    ) external;

    function getCommerceBalance(
        address commerce,
        address token
    ) external view returns (uint256);

    // === SERVICE FEE MANAGEMENT ===
    function addToServiceFeeBalance(address token, uint256 amount) external;

    function subtractServiceFeeBalance(address token, uint256 amount) external;

    function getServiceFeeBalance(
        address token
    ) external view returns (uint256);

    // === TREASURY MANAGEMENT ===
    function setTreasuryWallet(
        address wallet,
        TreasuryWallet calldata treasuryWallet
    ) external;

    function addTreasuryWalletToList(address wallet) external;

    function removeTreasuryWalletFromList(address wallet) external;

    function setTreasuryWalletStatus(address wallet, bool isActive) external;

    function updateTreasuryWallet(
        address wallet,
        TreasuryWallet calldata updatedWallet
    ) external;

    function getTreasuryWallet(
        address wallet
    ) external view returns (TreasuryWallet memory);

    function getTreasuryWalletsList() external view returns (address[] memory);

    // === WITHDRAWAL MANAGEMENT ===
    function addWithdrawalRecord(
        WithdrawalRecord calldata record
    ) external returns (uint256);

    function addCommerceWithdrawal(address commerce, uint256 index) external;

    function addTreasuryWithdrawal(address treasury, uint256 index) external;

    function addServiceFeeWithdrawal(uint256 index) external;

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

    // === PER-COMMERCE TOKEN WHITELIST MANAGEMENT ===
    function setCommerceTokenWhitelisted(
        address commerce,
        address token,
        bool whitelisted
    ) external;

    function isTokenWhitelistedForCommerce(
        address commerce,
        address token
    ) external view returns (bool);
}
