import { ethers } from "hardhat";

async function main() {
  try {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying Deramp system with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

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


    console.log("\n🎉 Deployment Summary:");
    console.log("==========================================");
    console.log(`DerampStorage:     ${storageAddress}`);
    console.log(`DerampProxy:       ${proxyAddress}`);
    console.log(`AccessManager:     ${accessManagerAddress}`);
    console.log(`InvoiceManager:    ${invoiceManagerAddress}`);
    console.log(`PaymentProcessor:  ${paymentProcessorAddress}`);
    console.log(`TreasuryManager:   ${treasuryManagerAddress}`);
    console.log(`WithdrawalManager: ${withdrawalManagerAddress}`);
    console.log("==========================================");
    
    console.log("\n🔧 Next Steps:");
    console.log("1. Grant roles to team members using AccessManager");
    console.log("2. Add production tokens to whitelist");
    console.log("3. Add commerces to whitelist");
    console.log("4. Configure treasury wallets");
    console.log("5. Set up monitoring and alerts");
    console.log("6. Run tests to verify functionality");
    
    console.log("\n✅ Complete modular system deployed successfully!");

    return {
      storage: storageAddress,
      proxy: proxyAddress,
      accessManager: accessManagerAddress,
      invoiceManager: invoiceManagerAddress,
      paymentProcessor: paymentProcessorAddress,
      treasuryManager: treasuryManagerAddress,
      withdrawalManager: withdrawalManagerAddress
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