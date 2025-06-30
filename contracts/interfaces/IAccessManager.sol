// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAccessManager {
    // Role constants
    function getOnboardingRole() external pure returns (bytes32);

    function getTokenManagerRole() external pure returns (bytes32);

    function getTreasuryManagerRole() external pure returns (bytes32);

    // Role management
    function grantRole(bytes32 role, address account) external;

    function revokeRole(bytes32 role, address account) external;

    function hasRole(
        bytes32 role,
        address account
    ) external view returns (bool);

    // Token whitelist
    function addTokenToWhitelist(address token) external;

    function removeTokenFromWhitelist(address token) external;

    function addMultipleTokensToWhitelist(address[] calldata tokens) external;

    function removeMultipleTokensFromWhitelist(
        address[] calldata tokens
    ) external;

    function isTokenWhitelisted(address token) external view returns (bool);

    // Commerce whitelist
    function addCommerceToWhitelist(address commerce) external;

    function removeCommerceFromWhitelist(address commerce) external;

    function addMultipleCommercesToWhitelist(
        address[] calldata commerces
    ) external;

    function removeMultipleCommercesFromWhitelist(
        address[] calldata commerces
    ) external;

    function isCommerceWhitelisted(
        address commerce
    ) external view returns (bool);

    // Fee management
    function setDefaultFeePercent(uint256 feePercent) external;

    function setCommerceFee(address commerce, uint256 feePercent) external;

    function setMultipleCommerceFees(
        address[] calldata commerces,
        uint256[] calldata feePercents
    ) external;

    function getCommerceFee(address commerce) external view returns (uint256);

    function getDefaultFeePercent() external view returns (uint256);
}
