// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DerampProxy
 * @notice Main entry point for the Deramp modular smart contract system.
 *
 * @dev Responsibilities:
 * - Exposes a unified API for all business logic modules (managers).
 * - Delegates calls to the appropriate manager contract (AccessManager, InvoiceManager, PaymentProcessor, WithdrawalManager, TreasuryManager).
 * - Handles module upgrades via setter functions (setXManager).
 * - Enforces access control and pausing at the proxy level.
 *
 * Upgradeability:
 * - The proxy is designed to be upgradeable by swapping manager addresses.
 * - All business logic should reside in the managers, not in the proxy.
 * - The proxy should remain as thin as possible for security and maintainability.
 *
 * Security:
 * - Only the owner can upgrade modules or pause/unpause the system.
 * - All critical actions are protected by role-based access control.
 * - The proxy should never hold user funds directly; all balances are managed in the storage contract.
 *
 * Recommendations:
 * - When adding new modules, follow the same delegation pattern.
 * - Keep the proxy free of business logic.
 * - Document all new manager integrations clearly.
 */
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDerampStorage.sol";
import "./interfaces/IAccessManager.sol";
import "./interfaces/IInvoiceManager.sol";
import "./interfaces/IPaymentProcessor.sol";
import "./interfaces/IWithdrawalManager.sol";
import "./interfaces/ITreasuryManager.sol";

contract DerampProxy is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    // Module contracts
    address public storageContract;
    address public accessManager;
    address public invoiceManager;
    address public paymentProcessor;
    address public withdrawalManager;
    address public treasuryManager;

    // Emergency controls
    event Emergency(string reason);
    event ModuleUpdated(
        string moduleName,
        address oldAddress,
        address newAddress
    );

    constructor() Ownable(msg.sender) {}

    // === MODIFIERS ===
    modifier onlyTokenManagerOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getTokenManagerRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyOnboardingOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getOnboardingRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyTreasuryManagerOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getTreasuryManagerRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyBackendOperatorOrAdmin() {
        IAccessManager am = IAccessManager(accessManager);
        require(
            am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getBackendOperatorRole(), msg.sender),
            "Not authorized"
        );
        _;
    }
    modifier onlyAdmin() {
        require(
            IAccessManager(accessManager).hasRole(
                IAccessManager(accessManager).getDefaultAdminRole(),
                msg.sender
            ),
            "Not admin [PX]"
        );
        _;
    }
    modifier onlyCommerceOrAdminOrBackend(address commerce) {
        IAccessManager am = IAccessManager(accessManager);
        require(
            msg.sender == commerce ||
                am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getBackendOperatorRole(), msg.sender),
            "Not authorized [PX]"
        );
        _;
    }
    modifier onlyRegisteredCommerce() {
        require(
            IAccessManager(accessManager).isCommerceWhitelisted(msg.sender),
            "Commerce not whitelisted [PX]"
        );
        _;
    }

    // Internal modifier for commerce, admin, or backend
    function _onlyCommerceOrAdminOrBackend(address commerce) internal view {
        IAccessManager am = IAccessManager(accessManager);
        require(
            msg.sender == commerce ||
                am.hasRole(am.getDefaultAdminRole(), msg.sender) ||
                am.hasRole(am.getBackendOperatorRole(), msg.sender),
            "Not authorized [PX]"
        );
    }

    // === MODULE MANAGEMENT ===
    function setStorageContract(address _storage) external onlyOwner {
        emit ModuleUpdated("storage", storageContract, _storage);
        storageContract = _storage;
    }

    function setAccessManager(address _accessManager) external onlyOwner {
        emit ModuleUpdated("accessManager", accessManager, _accessManager);
        accessManager = _accessManager;
    }

    function setInvoiceManager(address _invoiceManager) external onlyOwner {
        emit ModuleUpdated("invoiceManager", invoiceManager, _invoiceManager);
        invoiceManager = _invoiceManager;
    }

    function setPaymentProcessor(address _paymentProcessor) external onlyOwner {
        emit ModuleUpdated(
            "paymentProcessor",
            paymentProcessor,
            _paymentProcessor
        );
        paymentProcessor = _paymentProcessor;
    }

    function setWithdrawalManager(
        address _withdrawalManager
    ) external onlyOwner {
        emit ModuleUpdated(
            "withdrawalManager",
            withdrawalManager,
            _withdrawalManager
        );
        withdrawalManager = _withdrawalManager;
    }

    function setTreasuryManager(address _treasuryManager) external onlyOwner {
        emit ModuleUpdated(
            "treasuryManager",
            treasuryManager,
            _treasuryManager
        );
        treasuryManager = _treasuryManager;
    }

    // === EMERGENCY CONTROLS ===
    function pause() external onlyOwner {
        _pause();
        emit Emergency("Contract paused by owner");
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // === INVOICE MANAGER FUNCTIONS ===
    function createInvoice(
        bytes32 id,
        address commerce,
        IDerampStorage.PaymentOption[] calldata paymentOptions,
        uint256 expiresAt
    ) external onlyCommerceOrAdminOrBackend(commerce) whenNotPaused {
        _delegateToInvoiceManager(
            abi.encodeWithSignature(
                "createInvoice(bytes32,address,(address,uint256)[],uint256)",
                id,
                commerce,
                paymentOptions,
                expiresAt
            )
        );
    }

    function cancelInvoice(bytes32 id) external whenNotPaused {
        address commerce = IDerampStorage(storageContract)
            .getInvoice(id)
            .commerce;
        require(commerce != address(0), "Invoice not found [PX]");
        _onlyCommerceOrAdminOrBackend(commerce);
        _delegateToInvoiceManager(
            abi.encodeWithSignature("cancelInvoice(bytes32)", id)
        );
    }

    // === PAYMENT PROCESSOR FUNCTIONS ===

    function payInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount
    ) external payable whenNotPaused nonReentrant {
        // Transfer tokens from msg.sender to proxy
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _delegateToPaymentProcessor(
            abi.encodeWithSignature(
                "payInvoice(bytes32,address,uint256,address)",
                invoiceId,
                token,
                amount,
                msg.sender
            )
        );
    }

    function refundInvoice(bytes32 id) external whenNotPaused nonReentrant {
        address commerce = IDerampStorage(storageContract)
            .getInvoice(id)
            .commerce;
        require(commerce != address(0), "Invoice not found");
        _onlyCommerceOrAdminOrBackend(commerce);
        _delegateToPaymentProcessor(
            abi.encodeWithSignature("refundInvoice(bytes32)", id)
        );
    }

    // === WITHDRAWAL MANAGER FUNCTIONS ===

    function withdraw(
        address token
    ) external whenNotPaused nonReentrant onlyRegisteredCommerce {
        // Get balance before withdrawal
        uint256 amount = IDerampStorage(storageContract).balances(
            msg.sender,
            token
        );
        require(amount > 0, "No funds to withdraw [PX]");

        // Delegate to WithdrawalManager to update balances
        _delegateToWithdrawalManager(
            abi.encodeWithSignature(
                "withdraw(address,address)",
                msg.sender,
                token
            )
        );

        // Transfer tokens from proxy to commerce
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function withdrawAll(
        address[] calldata tokens
    ) external whenNotPaused nonReentrant onlyRegisteredCommerce {
        require(tokens.length > 0, "No tokens provided [PX]");

        // Get amounts before withdrawal
        uint256[] memory amounts = new uint256[](tokens.length);
        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = IDerampStorage(storageContract).balances(
                msg.sender,
                tokens[i]
            );
            if (amounts[i] > 0) {
                totalWithdrawn++;
            }
        }

        require(totalWithdrawn > 0, "No funds to withdraw [PX]");

        // Delegate to WithdrawalManager to update balances
        _delegateToWithdrawalManager(
            abi.encodeWithSignature(
                "withdrawAll(address,address[])",
                msg.sender,
                tokens
            )
        );

        // Transfer tokens from proxy to commerce
        for (uint256 i = 0; i < tokens.length; i++) {
            if (amounts[i] > 0) {
                IERC20(tokens[i]).safeTransfer(msg.sender, amounts[i]);
            }
        }
    }

    function withdrawTo(
        address token,
        uint256 amount,
        address to
    ) external whenNotPaused nonReentrant onlyRegisteredCommerce {
        require(amount > 0, "Amount must be greater than 0 [PX]");
        require(to != address(0), "Invalid recipient [PX]");
        require(
            IDerampStorage(storageContract).balances(msg.sender, token) >=
                amount,
            "Insufficient balance [PX]"
        );

        // Delegate to WithdrawalManager to update balances
        _delegateToWithdrawalManager(
            abi.encodeWithSignature(
                "withdrawTo(address,address,uint256,address)",
                msg.sender,
                token,
                amount,
                to
            )
        );

        // Transfer tokens from proxy to recipient
        IERC20(token).safeTransfer(to, amount);
    }

    // === TREASURY MANAGER FUNCTIONS ===

    function addTreasuryWallet(
        address wallet,
        string calldata description
    ) external onlyAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "addTreasuryWallet(address,string)",
                wallet,
                description
            )
        );
    }

    function removeTreasuryWallet(
        address wallet
    ) external onlyAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature("removeTreasuryWallet(address)", wallet)
        );
    }

    function setTreasuryWalletStatus(
        address wallet,
        bool isActive
    ) external onlyAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "setTreasuryWalletStatus(address,bool)",
                wallet,
                isActive
            )
        );
    }

    function updateTreasuryWallet(
        address wallet,
        IDerampStorage.TreasuryWallet calldata updatedWallet
    ) external onlyAdmin whenNotPaused {
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "updateTreasuryWallet(address,(address,bool,uint256,string))",
                wallet,
                updatedWallet
            )
        );
    }

    function withdrawServiceFeesToTreasury(
        address token,
        address to
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        // Get service fee balance before withdrawal
        uint256 amount = IDerampStorage(storageContract).getServiceFeeBalance(
            token
        );
        require(amount > 0, "No service fees to withdraw [PX]");

        // Delegate to TreasuryManager to update balances
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "withdrawServiceFeesToTreasury(address,address)",
                token,
                to
            )
        );

        // Transfer tokens from proxy to treasury
        IERC20(token).safeTransfer(to, amount);
    }

    function withdrawAllServiceFeesToTreasury(
        address[] calldata tokens,
        address to
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        require(tokens.length > 0, "No tokens provided [PX]");

        // Get amounts before withdrawal
        uint256[] memory amounts = new uint256[](tokens.length);
        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = IDerampStorage(storageContract).getServiceFeeBalance(
                tokens[i]
            );
            if (amounts[i] > 0) {
                totalWithdrawn++;
            }
        }

        require(totalWithdrawn > 0, "No service fees to withdraw [PX]");

        // Delegate to TreasuryManager to update balances
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "withdrawAllServiceFeesToTreasury(address[],address)",
                tokens,
                to
            )
        );

        // Transfer tokens from proxy to treasury
        for (uint256 i = 0; i < tokens.length; i++) {
            if (amounts[i] > 0) {
                IERC20(tokens[i]).safeTransfer(to, amounts[i]);
            }
        }
    }

    function withdrawAllServiceFeesToTreasuryAll(
        address to
    ) external onlyTreasuryManagerOrAdmin whenNotPaused {
        // Get all whitelisted tokens
        address[] memory whitelistedTokens = IDerampStorage(storageContract)
            .getWhitelistedTokens();
        require(whitelistedTokens.length > 0, "No whitelisted tokens [PX]");

        // Get amounts before withdrawal
        uint256[] memory amounts = new uint256[](whitelistedTokens.length);
        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < whitelistedTokens.length; i++) {
            amounts[i] = IDerampStorage(storageContract).getServiceFeeBalance(
                whitelistedTokens[i]
            );
            if (amounts[i] > 0) {
                totalWithdrawn++;
            }
        }

        require(totalWithdrawn > 0, "No service fees to withdraw [PX]");

        // Delegate to TreasuryManager to update balances
        _delegateToTreasuryManager(
            abi.encodeWithSignature(
                "withdrawAllServiceFeesToTreasury(address)",
                to
            )
        );

        // Transfer tokens from proxy to treasury
        for (uint256 i = 0; i < whitelistedTokens.length; i++) {
            if (amounts[i] > 0) {
                IERC20(whitelistedTokens[i]).safeTransfer(to, amounts[i]);
            }
        }
    }

    // === COMPATIBILITY FUNCTIONS ===

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x7f5828d0 || // Ownable (ERC173)
            interfaceId == 0x5c975abb; // Pausable
    }

    // === INTERNAL DELEGATION FUNCTIONS ===

    function _delegateToAccessManager(bytes memory data) internal {
        require(accessManager != address(0), "AccessManager not set");
        (bool success, ) = accessManager.call(data);
        require(success, "AccessManager call failed");
    }

    function _delegateToInvoiceManager(bytes memory data) internal {
        require(invoiceManager != address(0), "InvoiceManager not set");
        (bool success, ) = invoiceManager.call(data);
        require(success, "InvoiceManager call failed");
    }

    function _delegateToPaymentProcessor(bytes memory data) internal {
        require(paymentProcessor != address(0), "PaymentProcessor not set");
        (bool success, bytes memory returndata) = paymentProcessor.call(data);
        if (!success) {
            // Bubble up revert reason from PaymentProcessor
            if (returndata.length > 0) {
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert("PaymentProcessor call failed");
            }
        }
    }

    function _delegateToWithdrawalManager(bytes memory data) internal {
        require(withdrawalManager != address(0), "WithdrawalManager not set");
        (bool success, ) = withdrawalManager.call(data);
        require(success, "WithdrawalManager call failed");
    }

    function _delegateToTreasuryManager(bytes memory data) internal {
        require(treasuryManager != address(0), "TreasuryManager not set");
        (bool success, ) = treasuryManager.call(data);
        require(success, "TreasuryManager call failed");
    }

    // === FALLBACK ===

    receive() external payable {
        revert("Direct payments not allowed");
    }

    fallback() external payable {
        revert("Function not found");
    }
}
