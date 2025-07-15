// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AccessManager
 * @notice Handles all role-based access control and whitelisting for the Deramp system.
 *
 * @dev Responsibilities:
 * - Manages roles (admin, onboarding, token manager, treasury manager, backend operator).
 * - Handles token and commerce whitelisting.
 * - Exposes functions for role assignment, revocation, and permission checks.
 *
 * Upgradeability:
 * - All access control logic should reside here for easy upgrades.
 * - Only the proxy or authorized modules should interact with this contract.
 *
 * Security:
 * - Enforces strict role checks for all sensitive actions.
 * - Only the proxy or owner can grant/revoke roles.
 *
 * Recommendations:
 * - Document all roles and their intended use.
 * - Keep access control logic isolated from business logic.
 */
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IAccessManager.sol";
import "../interfaces/IDerampStorage.sol";

contract AccessManager is AccessControl, IAccessManager {
    IDerampStorage public immutable storageContract;
    address public immutable proxy;

    // === ROLE DEFINITIONS ===
    // DEFAULT_ADMIN_ROLE (0x00) - Supreme admin role (deployer initially)
    // Can do everything and manage all other roles

    // Operational roles for delegation
    bytes32 public constant ONBOARDING_ROLE = keccak256("ONBOARDING_ROLE");
    bytes32 public constant TOKEN_MANAGER_ROLE =
        keccak256("TOKEN_MANAGER_ROLE");
    bytes32 public constant TREASURY_MANAGER_ROLE =
        keccak256("TREASURY_MANAGER_ROLE");
    bytes32 public constant BACKEND_OPERATOR_ROLE =
        keccak256("BACKEND_OPERATOR_ROLE");

    // === MODIFIERS ===
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not admin");
        _;
    }

    modifier onlyAuthorized(bytes32 role) {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) ||
                hasRole(role, msg.sender),
            "Not authorized"
        );
        _;
    }

    modifier onlyProxy() {
        require(msg.sender == proxy, "Only proxy can call");
        _;
    }

    constructor(address _storage, address _proxy) {
        storageContract = IDerampStorage(_storage);
        proxy = _proxy;

        // Set up role hierarchy - DEFAULT_ADMIN_ROLE is admin of all roles
        _setRoleAdmin(ONBOARDING_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(TOKEN_MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(TREASURY_MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(BACKEND_OPERATOR_ROLE, DEFAULT_ADMIN_ROLE);

        // Grant supreme admin role to deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Grant operational roles to deployer initially (can delegate later)
        _grantRole(ONBOARDING_ROLE, msg.sender);
        _grantRole(TOKEN_MANAGER_ROLE, msg.sender);
        _grantRole(TREASURY_MANAGER_ROLE, msg.sender);
        _grantRole(BACKEND_OPERATOR_ROLE, msg.sender);
    }

    // === ROLE MANAGEMENT ===
    function grantRole(
        bytes32 role,
        address account
    ) public override(AccessControl, IAccessManager) onlyProxy {
        super.grantRole(role, account);
    }

    function revokeRole(
        bytes32 role,
        address account
    ) public override(AccessControl, IAccessManager) onlyProxy {
        super.revokeRole(role, account);
    }

    function hasRole(
        bytes32 role,
        address account
    ) public view override(AccessControl, IAccessManager) returns (bool) {
        return super.hasRole(role, account);
    }

    // === EMERGENCY FUNCTIONS (Admin Only) ===
    function emergencyPause() external onlyAdmin {
        // Emergency pause implementation
        emit EmergencyAction("SYSTEM_PAUSED", msg.sender);
    }

    // === TOKEN WHITELIST MANAGEMENT ===
    function addTokenToWhitelist(
        address token
    ) external onlyAuthorized(TOKEN_MANAGER_ROLE) {
        require(token != address(0), "Invalid token address");
        storageContract.setWhitelistedToken(token, true);
        emit TokenWhitelisted(token, true);
    }

    function removeTokenFromWhitelist(
        address token
    ) external onlyAuthorized(TOKEN_MANAGER_ROLE) {
        storageContract.setWhitelistedToken(token, false);
        emit TokenWhitelisted(token, false);
    }

    // === COMMERCE WHITELIST MANAGEMENT ===
    function addCommerceToWhitelist(
        address commerce
    ) external onlyAuthorized(ONBOARDING_ROLE) {
        require(commerce != address(0), "Invalid commerce address");
        storageContract.setWhitelistedCommerce(commerce, true);
        emit CommerceWhitelisted(commerce, true);
    }

    function removeCommerceFromWhitelist(
        address commerce
    ) external onlyAuthorized(ONBOARDING_ROLE) {
        storageContract.setWhitelistedCommerce(commerce, false);
        emit CommerceWhitelisted(commerce, false);
    }

    // === FEE MANAGEMENT ===
    function setDefaultFeePercent(
        uint256 feePercent
    ) external onlyAuthorized(ONBOARDING_ROLE) {
        require(feePercent <= 100, "Fee too high"); // Max 1%
        storageContract.setDefaultFeePercent(feePercent);
        emit DefaultFeePercentUpdated(feePercent);
    }

    function setCommerceFee(
        address commerce,
        uint256 feePercent
    ) external onlyAuthorized(ONBOARDING_ROLE) {
        require(feePercent <= 100, "Fee too high"); // Max 1%
        storageContract.setCommerceFee(commerce, feePercent);
        emit CommerceFeeUpdated(commerce, feePercent);
    }

    // === VIEW FUNCTIONS ===
    function isTokenWhitelisted(address token) external view returns (bool) {
        return storageContract.whitelistedTokens(token);
    }

    function getWhitelistedTokens() external view returns (address[] memory) {
        return storageContract.getWhitelistedTokens();
    }

    function isCommerceWhitelisted(
        address commerce
    ) external view returns (bool) {
        return storageContract.whitelistedCommerces(commerce);
    }

    function getCommerceFee(address commerce) external view returns (uint256) {
        uint256 customFee = storageContract.commerceFees(commerce);
        return customFee > 0 ? customFee : storageContract.defaultFeePercent();
    }

    function getDefaultFeePercent() external view returns (uint256) {
        return storageContract.defaultFeePercent();
    }

    // === ROLE CONSTANTS (for external access) ===
    function getOnboardingRole() external pure returns (bytes32) {
        return ONBOARDING_ROLE;
    }

    function getTokenManagerRole() external pure returns (bytes32) {
        return TOKEN_MANAGER_ROLE;
    }

    function getTreasuryManagerRole() external pure returns (bytes32) {
        return TREASURY_MANAGER_ROLE;
    }

    function getBackendOperatorRole() external pure returns (bytes32) {
        return BACKEND_OPERATOR_ROLE;
    }

    function getDefaultAdminRole() external pure returns (bytes32) {
        return DEFAULT_ADMIN_ROLE;
    }

    // === INTERFACE SUPPORT ===
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // === EVENTS ===
    event TokenWhitelisted(address indexed token, bool whitelisted);
    event CommerceWhitelisted(address indexed commerce, bool whitelisted);
    event DefaultFeePercentUpdated(uint256 feePercent);
    event CommerceFeeUpdated(address indexed commerce, uint256 feePercent);
    event EmergencyAction(string action, address indexed executor);

    // === PER-COMMERCE TOKEN WHITELIST MANAGEMENT ===
    function addTokenToCommerceWhitelist(
        address commerce,
        address[] calldata tokens
    ) external onlyProxy {
        for (uint256 i = 0; i < tokens.length; i++) {
            storageContract.setCommerceTokenWhitelisted(
                commerce,
                tokens[i],
                true
            );
        }
    }

    function removeTokenFromCommerceWhitelist(
        address commerce,
        address[] calldata tokens
    ) external onlyProxy {
        for (uint256 i = 0; i < tokens.length; i++) {
            storageContract.setCommerceTokenWhitelisted(
                commerce,
                tokens[i],
                false
            );
        }
    }

    function isTokenWhitelistedForCommerce(
        address commerce,
        address token
    ) external view returns (bool) {
        return storageContract.isTokenWhitelistedForCommerce(commerce, token);
    }
}
