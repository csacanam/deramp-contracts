import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";

export interface TestRoles {
  owner: HardhatEthersSigner;          // DEFAULT_ADMIN_ROLE - Can do everything
  tokenManager: HardhatEthersSigner;   // TOKEN_MANAGER_ROLE - Manages token whitelist
  onboardingManager: HardhatEthersSigner; // ONBOARDING_ROLE - Manages commerce whitelist
  treasuryManager: HardhatEthersSigner;   // TREASURY_MANAGER_ROLE - Manages treasury operations
  commerce1: HardhatEthersSigner;      // Whitelisted commerce
  commerce2: HardhatEthersSigner;      // Another whitelisted commerce
  payer1: HardhatEthersSigner;        // Regular user who pays invoices
  payer2: HardhatEthersSigner;        // Another payer
  treasury1: HardhatEthersSigner;     // Treasury wallet 1
  treasury2: HardhatEthersSigner;     // Treasury wallet 2
  unauthorized: HardhatEthersSigner;  // User with no special roles
}

export const ROLE_CONSTANTS = {
  DEFAULT_ADMIN_ROLE: ethers.ZeroHash,
  TOKEN_MANAGER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("TOKEN_MANAGER_ROLE")),
  ONBOARDING_ROLE: ethers.keccak256(ethers.toUtf8Bytes("ONBOARDING_ROLE")),
  TREASURY_MANAGER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("TREASURY_MANAGER_ROLE"))
};

export async function setupTestRoles(): Promise<TestRoles> {
  const signers = await ethers.getSigners();
  
  return {
    owner: signers[0],              // Deployer has all admin rights
    tokenManager: signers[1],       // Dedicated token manager
    onboardingManager: signers[2],  // Dedicated onboarding manager
    treasuryManager: signers[3],    // Dedicated treasury manager
    commerce1: signers[4],          // Primary commerce
    commerce2: signers[5],          // Secondary commerce
    payer1: signers[6],            // Primary payer
    payer2: signers[7],            // Secondary payer
    treasury1: signers[8],         // Primary treasury wallet
    treasury2: signers[9],         // Secondary treasury wallet
    unauthorized: signers[10]       // Unauthorized user
  };
}

export async function grantRoles(accessManager: any, roles: TestRoles) {
  // Grant roles to appropriate users
  await accessManager.grantRole(ROLE_CONSTANTS.TOKEN_MANAGER_ROLE, roles.tokenManager.address);
  await accessManager.grantRole(ROLE_CONSTANTS.ONBOARDING_ROLE, roles.onboardingManager.address);
  await accessManager.grantRole(ROLE_CONSTANTS.TREASURY_MANAGER_ROLE, roles.treasuryManager.address);
  
  // Grant admin role to treasury manager for TreasuryManager contract compatibility
  await accessManager.grantRole(ROLE_CONSTANTS.DEFAULT_ADMIN_ROLE, roles.treasuryManager.address);
}

export async function setupWhitelists(accessManager: any, roles: TestRoles, tokenAddresses: string[]) {
  // Add tokens to whitelist (using token manager)
  for (const tokenAddress of tokenAddresses) {
    await accessManager.connect(roles.tokenManager).addTokenToWhitelist(tokenAddress);
  }
  
  // Add commerces to whitelist (using onboarding manager)
  await accessManager.connect(roles.onboardingManager).addCommerceToWhitelist(roles.commerce1.address);
  await accessManager.connect(roles.onboardingManager).addCommerceToWhitelist(roles.commerce2.address);
} 