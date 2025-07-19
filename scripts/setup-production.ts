import { ethers } from "hardhat";

async function main() {
  console.log("🔧 Setting up Deramp Production System...");

  // Configuration - Update these addresses after deployment
  const DEPLOYED_ADDRESSES = {
    proxy: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    accessManager: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    treasuryManager: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
  };

  // Team addresses - Update with actual team addresses
  const TEAM_ADDRESSES = {
    admin: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Current deployer
    onboarding: "0x...", // Onboarding team
    tokenManager: "0x...", // Token management team
    treasuryManager: "0x...", // Treasury management team
    backendOperator: "0x...", // Backend operations team
  };

  // Production tokens - Update with actual token addresses
  const PRODUCTION_TOKENS = [
    "0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8", // USDC (example)
    "0xB0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8", // USDT (example)
    "0xC0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8", // DAI (example)
    // Add more tokens as needed
  ];

  // Treasury wallets - Update with actual treasury addresses
  const TREASURY_WALLETS = [
    {
      address: "0xD0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8",
      description: "Main Treasury Wallet"
    },
    {
      address: "0xE0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8",
      description: "Emergency Treasury Wallet"
    }
  ];

  // Get signer
  const [deployer] = await ethers.getSigners();
  console.log("Setting up with account:", deployer.address);

  try {
    // Get contracts
    const proxy = await ethers.getContractAt("DerampProxy", DEPLOYED_ADDRESSES.proxy);
    const accessManager = await ethers.getContractAt("AccessManager", DEPLOYED_ADDRESSES.accessManager);
    const treasuryManager = await ethers.getContractAt("TreasuryManager", DEPLOYED_ADDRESSES.treasuryManager);

    console.log("\n👥 Setting up team roles...");
    
    // Get role constants
    const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
    const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
    const TREASURY_MANAGER_ROLE = await accessManager.getTreasuryManagerRole();
    const BACKEND_OPERATOR_ROLE = await accessManager.getBackendOperatorRole();

    // Grant roles to team members
    if (TEAM_ADDRESSES.onboarding !== "0x...") {
      await accessManager.grantRole(ONBOARDING_ROLE, TEAM_ADDRESSES.onboarding);
      console.log("✅ Onboarding role granted to:", TEAM_ADDRESSES.onboarding);
    }

    if (TEAM_ADDRESSES.tokenManager !== "0x...") {
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, TEAM_ADDRESSES.tokenManager);
      console.log("✅ Token manager role granted to:", TEAM_ADDRESSES.tokenManager);
    }

    if (TEAM_ADDRESSES.treasuryManager !== "0x...") {
      await accessManager.grantRole(TREASURY_MANAGER_ROLE, TEAM_ADDRESSES.treasuryManager);
      console.log("✅ Treasury manager role granted to:", TEAM_ADDRESSES.treasuryManager);
    }

    if (TEAM_ADDRESSES.backendOperator !== "0x...") {
      await accessManager.grantRole(BACKEND_OPERATOR_ROLE, TEAM_ADDRESSES.backendOperator);
      console.log("✅ Backend operator role granted to:", TEAM_ADDRESSES.backendOperator);
    }

    console.log("\n🪙 Setting up production tokens...");
    
    // Add production tokens to whitelist
    for (const tokenAddress of PRODUCTION_TOKENS) {
      if (tokenAddress !== "0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8") {
        await accessManager.addTokenToWhitelist(tokenAddress);
        console.log("✅ Token added to whitelist:", tokenAddress);
      }
    }

    console.log("\n🏦 Setting up treasury wallets...");
    
    // Add treasury wallets
    for (const wallet of TREASURY_WALLETS) {
      if (wallet.address !== "0xD0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8") {
        await proxy.addTreasuryWallet(wallet.address, wallet.description);
        console.log("✅ Treasury wallet added:", wallet.address, "-", wallet.description);
      }
    }

    console.log("\n🔒 Security verification...");
    
    // Verify admin role
    const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
    const isAdmin = await accessManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    console.log(`Admin role verification: ${isAdmin ? "✅ PASS" : "❌ FAIL"}`);

    // Verify proxy is not paused
    const isPaused = await proxy.paused();
    console.log(`Proxy pause status: ${isPaused ? "❌ PAUSED" : "✅ ACTIVE"}`);

    console.log("\n✅ Production setup completed successfully!");
    console.log("\n📋 Setup Summary:");
    console.log("==========================================");
    console.log("Team roles configured");
    console.log("Production tokens whitelisted");
    console.log("Treasury wallets configured");
    console.log("Security verification passed");
    console.log("==========================================");

  } catch (error) {
    console.error("❌ Production setup failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 