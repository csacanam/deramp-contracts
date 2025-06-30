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
    console.log("✅ DerampStorage deployed to:", await storage.getAddress());

    // 2. Deploy AccessManager
    console.log("\n🔐 Deploying AccessManager...");
    const AccessManager = await ethers.getContractFactory("AccessManager");
    const accessManager = await AccessManager.deploy(storage.address);
    await accessManager.deployed();
    console.log("✅ AccessManager deployed to:", accessManager.address);

    // 3. Deploy InvoiceManager
    console.log("\n📋 Deploying InvoiceManager...");
    const InvoiceManager = await ethers.getContractFactory("InvoiceManager");
    const invoiceManager = await InvoiceManager.deploy(
      storage.address,
      accessManager.address
    );
    await invoiceManager.deployed();
    console.log("✅ InvoiceManager deployed to:", invoiceManager.address);

    // 4. Deploy PaymentProcessor
    console.log("\n💳 Deploying PaymentProcessor...");
    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    const paymentProcessor = await PaymentProcessor.deploy(
      storage.address,
      accessManager.address
    );
    await paymentProcessor.deployed();
    console.log("✅ PaymentProcessor deployed to:", paymentProcessor.address);

    // Note: TreasuryManager and WithdrawalManager have compilation issues
    // We'll deploy them separately once fixed

    // 5. Deploy Proxy with available modules
    console.log("\n🔄 Deploying DerampProxy...");
    const DerampProxy = await ethers.getContractFactory("DerampProxy");
    const proxy = await DerampProxy.deploy(
      storage.address,
      accessManager.address,
      invoiceManager.address,
      paymentProcessor.address,
      ethers.constants.AddressZero, // TreasuryManager placeholder
      ethers.constants.AddressZero  // WithdrawalManager placeholder
    );
    await proxy.deployed();
    console.log("✅ DerampProxy deployed to:", proxy.address);

    // 6. Set proxy as authorized caller in storage
    console.log("\n🔗 Setting up permissions...");
    await storage.setAuthorizedCaller(proxy.address, true);
    await storage.setAuthorizedCaller(invoiceManager.address, true);
    await storage.setAuthorizedCaller(paymentProcessor.address, true);
    console.log("✅ Permissions configured");

    // 7. Test basic functionality
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
    console.log(`DerampStorage:     ${storage.address}`);
    console.log(`AccessManager:     ${accessManager.address}`);
    console.log(`InvoiceManager:    ${invoiceManager.address}`);
    console.log(`PaymentProcessor:  ${paymentProcessor.address}`);
    console.log(`DerampProxy:       ${proxy.address}`);
    console.log("==========================================");
    
    console.log("\n⚠️  Note: TreasuryManager and WithdrawalManager need compilation fixes");
    console.log("✅ Core payment functionality is ready for testing!");

    return {
      storage: storage.address,
      accessManager: accessManager.address,
      invoiceManager: invoiceManager.address,
      paymentProcessor: paymentProcessor.address,
      proxy: proxy.address
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