// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IYieldManager
 * @notice Interface for the YieldManager module in the Deramp system.
 *
 * @dev Implementation Guidelines:
 * - The YieldManager is responsible for handling all yield-related logic and accounting for each user (commerce) and token.
 * - The contract itself will be the depositor in external DeFi protocols (e.g., Aave, Compound), so the total balance in the protocol is global.
 * - Internal accounting must track each user's principal (amount deposited) and calculate their share of the total yield proportionally.
 * - When a user deposits, increase their principal and the total principal for the token.
 * - When a user withdraws, calculate their proportional share of the total balance (including yield) and update their principal accordingly.
 * - The APY should be fetched from the external protocol and is the same for all users at a given time for a specific token.
 * - Yield earned by a user is: (userPrincipal * totalProtocolBalance / totalPrincipal) - userPrincipal
 * - If you want to charge a fee on the yield, subtract it from the yield earned before allowing withdrawal.
 * - All state and logic related to yield should be isolated in the YieldManager for upgradeability and modularity.
 *
 * Example for Aave integration:
 * - The contract deposits/withdraws tokens to/from Aave on behalf of all users.
 * - The contract receives aTokens (e.g., aUSDC) as proof of deposit.
 * - The total aToken balance represents the total protocol balance (principal + yield).
 * - Each user's share is tracked internally and updated on deposit/withdrawal.
 * - The APY can be fetched from Aave's data provider contract.
 *
 * Security Considerations:
 * - Ensure that withdrawals cannot exceed the user's proportional share.
 * - Validate all external calls to DeFi protocols for success and correct behavior.
 * - Consider adding emergency withdrawal and pausing mechanisms.
 *
 * Upgradeability:
 * - Keep all yield logic in this module to allow future upgrades without affecting the rest of the system.
 * - The proxy should delegate yield-related calls to the YieldManager.
 */
interface IYieldManager {
    /**
     * @notice Deposit tokens from a commerce into yield.
     */
    function depositToYield(
        address commerce,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Withdraw tokens from yield back to the commerce's available balance.
     */
    function withdrawFromYield(
        address commerce,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Returns the principal (deposited amount) in yield for a given commerce and token.
     */
    function getYieldPrincipal(
        address commerce,
        address token
    ) external view returns (uint256);

    /**
     * @notice Returns the yield (interest) earned for a given commerce and token.
     */
    function getYieldEarned(
        address commerce,
        address token
    ) external view returns (uint256);

    /**
     * @notice Returns the total balance in yield (principal + interest) for a given commerce and token.
     */
    function getYieldBalance(
        address commerce,
        address token
    ) external view returns (uint256);

    /**
     * @notice Returns the current APY for a given token and provider.
     */
    function getAPY(address token) external view returns (uint256);
}
