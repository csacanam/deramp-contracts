import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Networks to deploy to
const NETWORKS = {
  // Local development
  hardhat: "Hardhat Local Network",
  
  // Testnets
  celoTestnet: "Celo Testnet (Alfajores)",
  baseTestnet: "Base Testnet (Goerli)",
  polygonTestnet: "Polygon Testnet (Mumbai)",
  bscTestnet: "BSC Testnet",
  
  // Mainnets
  celo: "Celo Mainnet",
  base: "Base Mainnet",
  polygon: "Polygon Mainnet",
  bsc: "BSC Mainnet",
};

// Function to load base configuration
function loadBaseConfig() {
  const configPath = path.join(__dirname, "config.ts");
  
  if (!fs.existsSync(configPath)) {
    throw new Error("config.ts not found. Please create this file with your configuration.");
  }
  
  // Validate required environment variables
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable not set. Please set it in your .env file.");
  }
  
  if (!process.env.ADMIN_WALLET) {
    throw new Error("ADMIN_WALLET environment variable not set. Please set it in your .env file.");
  }
  
  // Validate optional backend wallet
  const backendWallet = process.env.BACKEND_WALLET;
  let normalizedBackendWallet = null;
  
  if (backendWallet) {
    normalizedBackendWallet = backendWallet.startsWith('0x') 
      ? backendWallet 
      : '0x' + backendWallet;
      
    if (normalizedBackendWallet.length !== 42) {
      throw new Error("BACKEND_WALLET must be a valid Ethereum address (40 hex characters, with or without 0x prefix).");
    }
  }
  
  // Additional validation for admin wallet format
  const adminWallet = process.env.ADMIN_WALLET.startsWith('0x') 
    ? process.env.ADMIN_WALLET 
    : '0x' + process.env.ADMIN_WALLET;
    
  if (adminWallet.length !== 42) {
    throw new Error("ADMIN_WALLET must be a valid Ethereum address (40 hex characters, with or without 0x prefix).");
  }
  
  // Dynamic import of the base config file
  const configModule = require(configPath);
  return {
    ADMIN_WALLET: adminWallet,
    BACKEND_WALLET: normalizedBackendWallet,
    PRODUCTION_TOKENS: configModule.PRODUCTION_TOKENS,
    VALIDATION: configModule.VALIDATION
  };
}

// Function to save deployed addresses to a simple JSON file
function saveDeployedAddresses(network: string, deployedAddresses: any) {
  // Create deployed-addresses directory if it doesn't exist
  const addressesDir = path.join(__dirname, '..', 'deployed-addresses');
  if (!fs.existsSync(addressesDir)) {
    fs.mkdirSync(addressesDir, { recursive: true });
  }
  
  const addressesPath = path.join(addressesDir, `${network}-contract-addresses.json`);
  
  const addressesData = {
    network: network,
    networkName: NETWORKS[network as keyof typeof NETWORKS] || network,
    deployedAt: new Date().toISOString(),
    addresses: deployedAddresses
  };
  
  fs.writeFileSync(addressesPath, JSON.stringify(addressesData, null, 2), "utf8");
  console.log(`✅ Deployed addresses saved: deployed-addresses/${network}-contract-addresses.json`);
}

async function deployAndSetupToNetwork(network: string) {
  console.log(`\n🚀 Deploying and setting up ${NETWORKS[network as keyof typeof NETWORKS]}...`);
  
  try {
    // Load base configuration
    console.log("📋 Loading base configuration...");
    const baseConfig = loadBaseConfig();
    
    // Validate admin wallet
    if (!baseConfig.ADMIN_WALLET) {
      throw new Error("Please edit config-base.ts and set ADMIN_WALLET address");
    }
    
    console.log(`✅ Admin wallet: ${baseConfig.ADMIN_WALLET}`);

    // Get the network provider
    const provider = ethers.provider;
    const [deployer] = await ethers.getSigners();
    
    console.log(`Account: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await provider.getBalance(deployer.address))} ETH`);

    // 1. Deploy DerampStorage
    console.log("\n📦 Deploying DerampStorage...");
    const DerampStorage = await ethers.getContractFactory("DerampStorage");
    const storage = await DerampStorage.deploy();
    await storage.waitForDeployment();
    const storageAddress = await storage.getAddress();
    console.log("✅ DerampStorage deployed to:", storageAddress);

    // 2. Deploy DerampProxy
    console.log("\n🔄 Deploying DerampProxy...");
    const DerampProxy = await ethers.getContractFactory("DerampProxy");
    const proxy = await DerampProxy.deploy();
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log("✅ DerampProxy deployed to:", proxyAddress);

    // 3. Deploy AccessManager
    console.log("\n🔐 Deploying AccessManager...");
    const AccessManager = await ethers.getContractFactory("AccessManager");
    const accessManager = await AccessManager.deploy(
      storageAddress,
      proxyAddress
    );
    await accessManager.waitForDeployment();
    const accessManagerAddress = await accessManager.getAddress();
    console.log("✅ AccessManager deployed to:", accessManagerAddress);

    // 4. Deploy InvoiceManager
    console.log("\n📋 Deploying InvoiceManager...");
    const InvoiceManager = await ethers.getContractFactory("InvoiceManager");
    const invoiceManager = await InvoiceManager.deploy(
      storageAddress,
      accessManagerAddress,
      proxyAddress
    );
    await invoiceManager.waitForDeployment();
    const invoiceManagerAddress = await invoiceManager.getAddress();
    console.log("✅ InvoiceManager deployed to:", invoiceManagerAddress);

    // 5. Deploy PaymentProcessor
    console.log("\n💳 Deploying PaymentProcessor...");
    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    const paymentProcessor = await PaymentProcessor.deploy(
      storageAddress,
      accessManagerAddress,
      proxyAddress
    );
    await paymentProcessor.waitForDeployment();
    const paymentProcessorAddress = await paymentProcessor.getAddress();
    console.log("✅ PaymentProcessor deployed to:", paymentProcessorAddress);

    // 6. Deploy TreasuryManager
    console.log("\n🏦 Deploying TreasuryManager...");
    const TreasuryManager = await ethers.getContractFactory("TreasuryManager");
    const treasuryManager = await TreasuryManager.deploy(
      storageAddress,
      accessManagerAddress,
      proxyAddress
    );
    await treasuryManager.waitForDeployment();
    const treasuryManagerAddress = await treasuryManager.getAddress();
    console.log("✅ TreasuryManager deployed to:", treasuryManagerAddress);

    // 7. Deploy WithdrawalManager
    console.log("\n💰 Deploying WithdrawalManager...");
    const WithdrawalManager = await ethers.getContractFactory("WithdrawalManager");
    const withdrawalManager = await WithdrawalManager.deploy(
      storageAddress,
      accessManagerAddress,
      proxyAddress
    );
    await withdrawalManager.waitForDeployment();
    const withdrawalManagerAddress = await withdrawalManager.getAddress();
    console.log("✅ WithdrawalManager deployed to:", withdrawalManagerAddress);

    // 8. Configure Proxy with all modules
    console.log("\n🔗 Configuring Proxy with modules...");
    await proxy.setStorageContract(storageAddress);
    await proxy.setAccessManager(accessManagerAddress);
    await proxy.setInvoiceManager(invoiceManagerAddress);
    await proxy.setPaymentProcessor(paymentProcessorAddress);
    await proxy.setTreasuryManager(treasuryManagerAddress);
    await proxy.setWithdrawalManager(withdrawalManagerAddress);
    console.log("✅ Proxy modules configured");

    // 9. Authorize managers in storage
    console.log("\n🔐 Authorizing managers in storage...");
    await storage.setModule("AccessManager", accessManagerAddress);
    await storage.setModule("InvoiceManager", invoiceManagerAddress);
    await storage.setModule("PaymentProcessor", paymentProcessorAddress);
    await storage.setModule("WithdrawalManager", withdrawalManagerAddress);
    await storage.setModule("TreasuryManager", treasuryManagerAddress);
    console.log("✅ Storage modules authorized");

    // 10. Setup production configuration
    console.log("\n🔧 Setting up production configuration...");
    
    // Define role constants
    const ONBOARDING_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ONBOARDING_ROLE"));
    const TOKEN_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_MANAGER_ROLE"));
    const TREASURY_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURY_MANAGER_ROLE"));
    const BACKEND_OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BACKEND_OPERATOR_ROLE"));

    // Log backend wallet configuration
    if (baseConfig.BACKEND_WALLET) {
      console.log(`🔧 Backend wallet configured: ${baseConfig.BACKEND_WALLET}`);
    } else {
      console.log(`🔧 Backend wallet: not configured (BACKEND_OPERATOR_ROLE will not be assigned)`);
    }

    // Setup production tokens
    console.log("🪙 Setting up production tokens...");
    let tokensAdded = 0;
    for (const tokenAddress of baseConfig.PRODUCTION_TOKENS) {
      if (tokenAddress && tokenAddress !== baseConfig.VALIDATION.EMPTY_ADDRESS) {
        try {
          await accessManager.addTokenToWhitelist(tokenAddress);
          console.log(`✅ Token added to whitelist: ${tokenAddress}`);
          tokensAdded++;
        } catch (error: any) {
          console.log(`⚠️  Failed to add token ${tokenAddress}: ${error.message}`);
        }
      }
    }
    
    if (tokensAdded === 0) {
      console.log("⚠️  No production tokens configured");
    }

    // Setup treasury wallet (uses admin wallet by default)
    console.log("🏦 Setting up treasury wallet...");
    try {
      await proxy.addTreasuryWallet(baseConfig.ADMIN_WALLET, "Main Treasury Wallet");
      console.log(`✅ Treasury wallet added: ${baseConfig.ADMIN_WALLET}`);
    } catch (error: any) {
      console.log(`⚠️  Failed to add treasury wallet: ${error.message}`);
    }

    // 11. Transfer all roles to admin wallet and revoke from deployer
    if (baseConfig.ADMIN_WALLET.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log("\n👑 Transferring roles to admin wallet...");
      
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash; // 0x00

      // Grant all roles to admin wallet
      await accessManager.grantRole(DEFAULT_ADMIN_ROLE, baseConfig.ADMIN_WALLET);
      await accessManager.grantRole(ONBOARDING_ROLE, baseConfig.ADMIN_WALLET);
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, baseConfig.ADMIN_WALLET);
      await accessManager.grantRole(TREASURY_MANAGER_ROLE, baseConfig.ADMIN_WALLET);
      
      // Grant backend operator role to appropriate wallet
      if (baseConfig.BACKEND_WALLET) {
        await accessManager.grantRole(BACKEND_OPERATOR_ROLE, baseConfig.BACKEND_WALLET);
        console.log(`✅ Backend Operator role granted to: ${baseConfig.BACKEND_WALLET}`);
      } else {
        await accessManager.grantRole(BACKEND_OPERATOR_ROLE, baseConfig.ADMIN_WALLET);
        console.log(`✅ Backend Operator role granted to: ${baseConfig.ADMIN_WALLET}`);
      }
      
      console.log("✅ All roles granted to admin wallet");

      // Revoke all roles from deployer
      await accessManager.revokeRole(ONBOARDING_ROLE, deployer.address);
      await accessManager.revokeRole(TOKEN_MANAGER_ROLE, deployer.address);
      await accessManager.revokeRole(TREASURY_MANAGER_ROLE, deployer.address);
      await accessManager.revokeRole(BACKEND_OPERATOR_ROLE, deployer.address);
      await accessManager.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address);
      console.log("✅ All roles revoked from deployer");
    } else {
      console.log("\n⚠️  Skipping role transfer - admin wallet is same as deployer");
    }

    // 12. Save deployed addresses
    console.log("\n📝 Saving deployed addresses...");
    const deployedAddresses = {
      storage: storageAddress,
      proxy: proxyAddress,
      accessManager: accessManagerAddress,
      invoiceManager: invoiceManagerAddress,
      paymentProcessor: paymentProcessorAddress,
      treasuryManager: treasuryManagerAddress,
      withdrawalManager: withdrawalManagerAddress
    };
    
    saveDeployedAddresses(network, deployedAddresses);

    console.log(`\n🎉 Deployment and setup to ${NETWORKS[network as keyof typeof NETWORKS]} completed successfully!`);
    console.log("==========================================");
    console.log(`DerampStorage:      ${storageAddress}`);
    console.log(`DerampProxy:        ${proxyAddress}`);
    console.log(`AccessManager:      ${accessManagerAddress}`);
    console.log(`InvoiceManager:     ${invoiceManagerAddress}`);
    console.log(`PaymentProcessor:   ${paymentProcessorAddress}`);
    console.log(`TreasuryManager:    ${treasuryManagerAddress}`);
    console.log(`WithdrawalManager:  ${withdrawalManagerAddress}`);
    console.log("==========================================");
    console.log(`\n🔐 Admin wallet: ${baseConfig.ADMIN_WALLET}`);
    if (baseConfig.ADMIN_WALLET.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log(`📝 Deployer wallet: ${deployer.address} (roles revoked)`);
    } else {
      console.log(`📝 Deployer wallet: ${deployer.address} (same as admin)`);
    }
    console.log(`\n📋 Setup Summary:`);
    console.log(`- Team roles configured`);
    console.log(`- ${tokensAdded} production tokens whitelisted`);
    console.log(`- Treasury wallet configured`);

    return deployedAddresses;

  } catch (error) {
    console.error(`❌ Deployment and setup to ${network} failed:`, error);
    throw error;
  }
}

async function main() {
  // Get network from hardhat environment
  const network = process.env.HARDHAT_NETWORK || "hardhat";
  
  console.log(`🚀 Starting deployment and setup to ${network}...`);
  
  try {
    await deployAndSetupToNetwork(network);
    console.log(`\n✅ Deployment and setup to ${network} completed successfully!`);
  } catch (error) {
    console.error(`❌ Deployment and setup to ${network} failed:`, error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 