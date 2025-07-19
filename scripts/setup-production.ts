import { ethers } from "hardhat";
import { 
  CONTRACT_ADDRESSES, 
  TEAM_ADDRESSES, 
  PRODUCTION_TOKENS, 
  TREASURY_WALLET
} from "./config";

async function main() {
  console.log("🔧 Setting up Deramp Production System...");

  // Get signer
  const [deployer] = await ethers.getSigners();
  console.log("Setting up with account:", deployer.address);

  try {
    // Get contracts
    const proxy = await ethers.getContractAt("DerampProxy", CONTRACT_ADDRESSES.proxy);
    const accessManager = await ethers.getContractAt("AccessManager", CONTRACT_ADDRESSES.accessManager);

    console.log("\n👥 Setting up team roles...");
    
    // Define role constants directly (from AccessManager.sol)
    const ONBOARDING_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ONBOARDING_ROLE"));
    const TOKEN_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_MANAGER_ROLE"));
    const TREASURY_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURY_MANAGER_ROLE"));
    const BACKEND_OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BACKEND_OPERATOR_ROLE"));

    // Grant roles to team members
    const rolesToGrant = [
      { role: ONBOARDING_ROLE, address: TEAM_ADDRESSES.onboarding, name: "Onboarding" },
      { role: TOKEN_MANAGER_ROLE, address: TEAM_ADDRESSES.tokenManager, name: "Token Manager" },
      { role: TREASURY_MANAGER_ROLE, address: TEAM_ADDRESSES.treasuryManager, name: "Treasury Manager" },
      { role: BACKEND_OPERATOR_ROLE, address: TEAM_ADDRESSES.backendOperator, name: "Backend Operator" }
    ];

    for (const { role, address, name } of rolesToGrant) {
      if (address && address !== "0x0000000000000000000000000000000000000000") {
        try {
          await accessManager.grantRole(role, address);
          console.log(`✅ ${name} role granted to: ${address}`);
        } catch (error) {
          console.log(`⚠️  Failed to grant ${name} role: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        console.log(`⚠️  Skipping ${name} role - address not configured`);
      }
    }

    console.log("\n🪙 Setting up production tokens...");
    
    // Add production tokens to whitelist
    let tokensAdded = 0;
    for (const tokenAddress of PRODUCTION_TOKENS) {
      if (tokenAddress && tokenAddress !== "0x0000000000000000000000000000000000000000") {
        try {
          await accessManager.addTokenToWhitelist(tokenAddress);
          console.log("✅ Token added to whitelist:", tokenAddress);
          tokensAdded++;
        } catch (error) {
          console.log(`⚠️  Failed to add token ${tokenAddress}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    if (tokensAdded === 0) {
      console.log("⚠️  No production tokens configured - skipping token whitelist setup");
    }

    console.log("\n🏦 Setting up treasury wallet...");
    
    // Add treasury wallet
    if (TREASURY_WALLET.address && 
        TREASURY_WALLET.address !== "0x0000000000000000000000000000000000000000") {
      try {
        await proxy.addTreasuryWallet(TREASURY_WALLET.address, TREASURY_WALLET.description);
        console.log("✅ Treasury wallet added:", TREASURY_WALLET.address, "-", TREASURY_WALLET.description);
      } catch (error) {
        console.log(`⚠️  Failed to add treasury wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.log("⚠️  Treasury wallet not configured - skipping treasury setup");
    }

    console.log("\n📋 Contract Addresses:");
    console.log(`Proxy: ${CONTRACT_ADDRESSES.proxy}`);
    console.log(`AccessManager: ${CONTRACT_ADDRESSES.accessManager}`);

    console.log("\n✅ Production setup completed successfully!");
    console.log("\n📋 Setup Summary:");
    console.log("==========================================");
    console.log("Team roles configured");
    console.log(`${tokensAdded} production tokens whitelisted`);
    console.log("Treasury wallet configured");
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
