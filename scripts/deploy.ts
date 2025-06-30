import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying Deramp Modular System...");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  try {
    // 1. Deploy Storage
    console.log("\n📦 Deploying DerampStorage...");
    const DerampStorage = await ethers.getContractFactory("DerampStorage");
    const storage = await DerampStorage.deploy();
    await storage.waitForDeployment();
    const storageAddress = await storage.getAddress();
    console.log("✅ DerampStorage deployed to:", storageAddress);

    // 2. Deploy AccessManager
    console.log("\n🔐 Deploying AccessManager...");
    const AccessManager = await ethers.getContractFactory("AccessManager");
    const accessManager = await AccessManager.deploy(storageAddress);
    await accessManager.waitForDeployment();
    const accessManagerAddress = await accessManager.getAddress();
    console.log("✅ AccessManager deployed to:", accessManagerAddress);

    // 3. Deploy InvoiceManager
    console.log("\n📋 Deploying InvoiceManager...");
    const InvoiceManager = await ethers.getContractFactory("InvoiceManager");
    const invoiceManager = await InvoiceManager.deploy(
      storageAddress,
      accessManagerAddress
    );
    await invoiceManager.waitForDeployment();
    const invoiceManagerAddress = await invoiceManager.getAddress();
    console.log("✅ InvoiceManager deployed to:", invoiceManagerAddress);

    // 4. Deploy PaymentProcessor
    console.log("\n💳 Deploying PaymentProcessor...");
    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    const paymentProcessor = await PaymentProcessor.deploy(
      storageAddress,
      accessManagerAddress
    );
    await paymentProcessor.waitForDeployment();
    const paymentProcessorAddress = await paymentProcessor.getAddress();
    console.log("✅ PaymentProcessor deployed to:", paymentProcessorAddress);

    // 5. Deploy TreasuryManager
    console.log("\n🏦 Deploying TreasuryManager...");
    const TreasuryManager = await ethers.getContractFactory("TreasuryManager");
    const treasuryManager = await TreasuryManager.deploy(
      storageAddress,
      accessManagerAddress
    );
    await treasuryManager.waitForDeployment();
    const treasuryManagerAddress = await treasuryManager.getAddress();
    console.log("✅ TreasuryManager deployed to:", treasuryManagerAddress);

    // 6. Deploy WithdrawalManager
    console.log("\n💰 Deploying WithdrawalManager...");
    const WithdrawalManager = await ethers.getContractFactory("WithdrawalManager");
    const withdrawalManager = await WithdrawalManager.deploy(
      storageAddress,
      accessManagerAddress
    );
    await withdrawalManager.waitForDeployment();
    const withdrawalManagerAddress = await withdrawalManager.getAddress();
    console.log("✅ WithdrawalManager deployed to:", withdrawalManagerAddress);

    // 7. Deploy Proxy with all modules
    console.log("\n🔄 Deploying DerampProxy...");
    const DerampProxy = await ethers.getContractFactory("DerampProxy");
    const proxy = await DerampProxy.deploy(
      storageAddress,
      accessManagerAddress,
      invoiceManagerAddress,
      paymentProcessorAddress,
      treasuryManagerAddress,
      withdrawalManagerAddress
    );
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log("✅ DerampProxy deployed to:", proxyAddress);

    // 8. Set up permissions
    console.log("\n🔗 Setting up permissions...");
    await storage.setAuthorizedCaller(proxyAddress, true);
    await storage.setAuthorizedCaller(invoiceManagerAddress, true);
    await storage.setAuthorizedCaller(paymentProcessorAddress, true);
    await storage.setAuthorizedCaller(treasuryManagerAddress, true);
    await storage.setAuthorizedCaller(withdrawalManagerAddress, true);
    console.log("✅ Permissions configured");

    // 9. Test basic functionality
    console.log("\n🧪 Testing basic functionality...");
    
    // Test token whitelist
    const testToken = "0x1234567890123456789012345678901234567890";
    await accessManager.addTokenToWhitelist(testToken);
    const isWhitelisted = await accessManager.isTokenWhitelisted(testToken);
    console.log(`Token whitelisting test: ${isWhitelisted ? "✅ PASS" : "❌ FAIL"}`);

    // Test commerce whitelist
    const testCommerce = "0x2345678901234567890123456789012345678901";
    await accessManager.addCommerceToWhitelist(testCommerce);
    const isCommerceWhitelisted = await accessManager.isCommerceWhitelisted(testCommerce);
    console.log(`Commerce whitelisting test: ${isCommerceWhitelisted ? "✅ PASS" : "❌ FAIL"}`);

    console.log("\n🎉 Deployment Summary:");
    console.log("==========================================");
    console.log(`DerampStorage:     ${storageAddress}`);
    console.log(`AccessManager:     ${accessManagerAddress}`);
    console.log(`InvoiceManager:    ${invoiceManagerAddress}`);
    console.log(`PaymentProcessor:  ${paymentProcessorAddress}`);
    console.log(`TreasuryManager:   ${treasuryManagerAddress}`);
    console.log(`WithdrawalManager: ${withdrawalManagerAddress}`);
    console.log(`DerampProxy:       ${proxyAddress}`);
    console.log("==========================================");
    
    console.log("\n✅ Complete modular system deployed successfully!");

    return {
      storage: storageAddress,
      accessManager: accessManagerAddress,
      invoiceManager: invoiceManagerAddress,
      paymentProcessor: paymentProcessorAddress,
      treasuryManager: treasuryManagerAddress,
      withdrawalManager: withdrawalManagerAddress,
      proxy: proxyAddress
    };

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 