import { expect } from "chai";
import { ethers } from "hardhat";
import { 
  DerampStorage, 
  AccessManager, 
  InvoiceManager, 
  PaymentProcessor, 
  TreasuryManagerClean, 
  WithdrawalManager, 
  DerampProxy 
} from "../typechain-types";
import { setupTestRoles, grantRoles, setupWhitelists, TestRoles, ROLE_CONSTANTS } from "./test-setup";

describe("Deramp Modular System", function () {
  let storage: DerampStorage;
  let accessManager: AccessManager;
  let invoiceManager: InvoiceManager;
  let paymentProcessor: PaymentProcessor;
  let treasuryManager: TreasuryManagerClean;
  let withdrawalManager: WithdrawalManager;
  let proxy: DerampProxy;
  let roles: TestRoles;

  let testToken: any;
  let testToken2: any;

  const DEFAULT_FEE = 100; // 1%
  const CUSTOM_FEE = 250; // 2.5%

  beforeEach(async function () {
    // Setup standardized roles
    roles = await setupTestRoles();

    // Deploy mock ERC20 tokens for testing
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    testToken = await MockERC20.deploy("Test Token", "TEST", 18);
    testToken2 = await MockERC20.deploy("Test Token 2", "TEST2", 18);

    // Deploy core modules
    const DerampStorage = await ethers.getContractFactory("DerampStorage");
    storage = await DerampStorage.deploy();

    const AccessManager = await ethers.getContractFactory("AccessManager");
    accessManager = await AccessManager.deploy(await storage.getAddress());

    const InvoiceManager = await ethers.getContractFactory("InvoiceManager");
    invoiceManager = await InvoiceManager.deploy(
      await storage.getAddress(),
      await accessManager.getAddress()
    );

    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    paymentProcessor = await PaymentProcessor.deploy(
      await storage.getAddress(),
      await accessManager.getAddress()
    );

    const TreasuryManager = await ethers.getContractFactory("TreasuryManagerClean");
    treasuryManager = await TreasuryManager.deploy(
      await storage.getAddress(),
      await accessManager.getAddress()
    );

    const WithdrawalManager = await ethers.getContractFactory("WithdrawalManager");
    withdrawalManager = await WithdrawalManager.deploy(
      await storage.getAddress(),
      await accessManager.getAddress()
    );

    const DerampProxy = await ethers.getContractFactory("DerampProxy");
    proxy = await DerampProxy.deploy();

    // Set up proxy with all modules
    await proxy.setStorageContract(await storage.getAddress());
    await proxy.setAccessManager(await accessManager.getAddress());
    await proxy.setInvoiceManager(await invoiceManager.getAddress());
    await proxy.setPaymentProcessor(await paymentProcessor.getAddress());
    await proxy.setTreasuryManager(await treasuryManager.getAddress());
    await proxy.setWithdrawalManager(await withdrawalManager.getAddress());

    // Set up permissions
    await storage.setModule("AccessManager", await accessManager.getAddress());
    await storage.setModule("DerampProxy", await proxy.getAddress());
    await storage.setModule("InvoiceManager", await invoiceManager.getAddress());
    await storage.setModule("PaymentProcessor", await paymentProcessor.getAddress());
    await storage.setModule("TreasuryManagerClean", await treasuryManager.getAddress());
    await storage.setModule("WithdrawalManager", await withdrawalManager.getAddress());

    // Mint tokens for testing
    await testToken.mint(roles.payer1.address, ethers.parseEther("1000"));
    await testToken2.mint(roles.payer1.address, ethers.parseEther("1000"));
    
    // Approve tokens for payment processor
    await testToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));
    await testToken2.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));
  });

  describe("1. System Deployment & Setup", function () {
    it("Should deploy all modules successfully", async function () {
      expect(await storage.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await accessManager.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await invoiceManager.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await paymentProcessor.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await treasuryManager.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await withdrawalManager.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await proxy.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("Should set up proxy with all modules", async function () {
      expect(await proxy.storageContract()).to.equal(await storage.getAddress());
      expect(await proxy.accessManager()).to.equal(await accessManager.getAddress());
      expect(await proxy.invoiceManager()).to.equal(await invoiceManager.getAddress());
      expect(await proxy.paymentProcessor()).to.equal(await paymentProcessor.getAddress());
      expect(await proxy.treasuryManager()).to.equal(await treasuryManager.getAddress());
      expect(await proxy.withdrawalManager()).to.equal(await withdrawalManager.getAddress());
    });

    it("Should grant owner all roles by default", async function () {
      const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, roles.owner.address)).to.be.true;
    });
  });

  describe("2. Access Control & Permissions", function () {
    it("Should manage token whitelist", async function () {
      // Add token to whitelist
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      expect(await accessManager.isTokenWhitelisted(await testToken.getAddress())).to.be.true;

      // Remove token from whitelist
      await accessManager.removeTokenFromWhitelist(await testToken.getAddress());
      expect(await accessManager.isTokenWhitelisted(await testToken.getAddress())).to.be.false;
    });

    it("Should manage commerce whitelist", async function () {
      // Add commerce to whitelist
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);
      expect(await accessManager.isCommerceWhitelisted(roles.commerce1.address)).to.be.true;

      // Remove commerce from whitelist
      await accessManager.removeCommerceFromWhitelist(roles.commerce1.address);
      expect(await accessManager.isCommerceWhitelisted(roles.commerce1.address)).to.be.false;
    });

    it("Should manage multiple tokens/commerces at once", async function () {
      const tokens = [await testToken.getAddress(), await testToken2.getAddress()];
      const commerces = [roles.commerce1.address, roles.treasury1.address];

      await accessManager.addMultipleTokensToWhitelist(tokens);
      await accessManager.addMultipleCommercesToWhitelist(commerces);

      for (const token of tokens) {
        expect(await accessManager.isTokenWhitelisted(token)).to.be.true;
      }
      for (const comm of commerces) {
        expect(await accessManager.isCommerceWhitelisted(comm)).to.be.true;
      }
    });

    it("Should manage fee settings", async function () {
      // Set default fee
      await accessManager.setDefaultFeePercent(200); // 2%
      expect(await accessManager.getDefaultFeePercent()).to.equal(200);

      // Set commerce-specific fee
      await accessManager.setCommerceFee(roles.commerce1.address, CUSTOM_FEE);
      expect(await accessManager.getCommerceFee(roles.commerce1.address)).to.equal(CUSTOM_FEE);
    });

    it("Should prevent unauthorized access", async function () {
      await expect(
        accessManager.connect(roles.unauthorized).addTokenToWhitelist(await testToken.getAddress())
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });
  });

  describe("3. Invoice Management", function () {
    beforeEach(async function () {
      // Set up whitelist
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);
    });

    it("Should create invoice successfully", async function () {
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.commerce).to.equal(roles.commerce1.address);
      expect(invoice.payer).to.equal(roles.payer1.address);
      expect(invoice.status).to.equal(0); // PENDING
    });

    it("Should prevent duplicate invoice creation", async function () {
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(
        invoiceManager.connect(roles.owner).createInvoice(
          invoiceId,
          roles.payer1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWith("Invoice already exists");
    });

    it("Should get commerce invoice count", async function () {
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("invoice-2"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId1,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId2,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      expect(await invoiceManager.getCommerceInvoiceCount(roles.commerce1.address)).to.equal(2);
    });
  });

  describe("4. Payment Processing", function () {
    let invoiceId: string;
    const paymentAmount = ethers.parseEther("100");

    beforeEach(async function () {
      // Set up whitelist
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);

      // Create invoice
      invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );
    });

    it("Should process payment successfully", async function () {
      const initialBalance = await testToken.balanceOf(roles.payer1.address);

      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      // Check invoice status
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
      expect(invoice.paidToken).to.equal(await testToken.getAddress());
      expect(invoice.paidAmount).to.equal(paymentAmount);

      // Check token transfer
      const finalBalance = await testToken.balanceOf(roles.payer1.address);
      expect(finalBalance).to.equal(initialBalance - paymentAmount);

      // Check commerce balance (after fee deduction)
      const fee = (paymentAmount * BigInt(DEFAULT_FEE)) / BigInt(10000);
      const expectedCommerceAmount = paymentAmount - fee;
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress()))
        .to.equal(expectedCommerceAmount);
    });

    it("Should handle service fees correctly", async function () {
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      const expectedFee = (paymentAmount * BigInt(DEFAULT_FEE)) / BigInt(10000);
      expect(await storage.serviceFeeBalances(await testToken.getAddress()))
        .to.equal(expectedFee);
    });

    it("Should prevent payment of non-existent invoice", async function () {
      const fakeInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("fake-invoice"));

      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          fakeInvoiceId,
          await testToken.getAddress(),
          paymentAmount
        )
      ).to.be.revertedWith("Invoice does not exist");
    });

    it("Should prevent double payment", async function () {
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          paymentAmount
        )
      ).to.be.revertedWith("Invoice already paid");
    });

    it("Should process refund successfully", async function () {
      // Pay invoice first
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      const initialBalance = await testToken.balanceOf(roles.payer1.address);

      // Process refund
      await paymentProcessor.connect(roles.owner).refundInvoice(invoiceId);

      // Check invoice status
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(2); // REFUNDED

      // Check token refund
      const finalBalance = await testToken.balanceOf(roles.payer1.address);
      expect(finalBalance).to.equal(initialBalance + paymentAmount);
    });
  });

  describe("5. Treasury Management", function () {
    beforeEach(async function () {
      // Set up treasury role
      const TREASURY_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURY_MANAGER_ROLE"));
      await accessManager.grantRole(TREASURY_MANAGER_ROLE, roles.treasury1.address);
    });

    it("Should add treasury wallet", async function () {
      await treasuryManager.connect(roles.treasury1).addTreasuryWallet(
        roles.treasury2.address,
        "Treasury Wallet 1"
      );

      const treasuryWallet = await storage.treasuryWallets(roles.treasury2.address);
      expect(treasuryWallet.wallet).to.equal(roles.treasury2.address);
      expect(treasuryWallet.isActive).to.be.true;
      expect(treasuryWallet.description).to.equal("Treasury Wallet 1");
    });

    it("Should remove treasury wallet", async function () {
      await treasuryManager.connect(roles.treasury1).addTreasuryWallet(
        roles.treasury2.address,
        "Treasury Wallet 1"
      );

      await treasuryManager.connect(roles.treasury1).removeTreasuryWallet(roles.treasury2.address);

      // Check if wallet is removed from list (implementation dependent)
      const wallets = await treasuryManager.getActiveTreasuryWallets();
      expect(wallets).to.not.include(roles.treasury2.address);
    });

    it("Should manage treasury wallet status", async function () {
      await treasuryManager.connect(roles.treasury1).addTreasuryWallet(
        roles.treasury2.address,
        "Treasury Wallet 1"
      );

      await treasuryManager.connect(roles.treasury1).setTreasuryWalletStatus(
        roles.treasury2.address,
        false
      );

      const treasuryWallet = await storage.treasuryWallets(roles.treasury2.address);
      expect(treasuryWallet.isActive).to.be.false;
    });

    it("Should prevent unauthorized treasury operations", async function () {
      await expect(
        treasuryManager.connect(roles.unauthorized).addTreasuryWallet(
          roles.treasury2.address,
          "Unauthorized"
        )
      ).to.be.revertedWith("Not treasury manager");
    });
  });

  describe("6. Withdrawal System", function () {
    let invoiceId: string;
    const paymentAmount = ethers.parseEther("100");

    beforeEach(async function () {
      // Set up environment
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);

      // Create and pay invoice to have balance
      invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );
    });

    it("Should process commerce withdrawal", async function () {
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const initialTokenBalance = await testToken.balanceOf(roles.commerce1.address);

      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress(),
        commerceBalance,
        roles.commerce1.address
      );

      // Check balance updated
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress()))
        .to.equal(0);

      // Check token transfer
      const finalTokenBalance = await testToken.balanceOf(roles.commerce1.address);
      expect(finalTokenBalance).to.equal(initialTokenBalance + commerceBalance);
    });

    it("Should process service fee withdrawal", async function () {
      // Set up treasury
      const TREASURY_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURY_MANAGER_ROLE"));
      await accessManager.grantRole(TREASURY_MANAGER_ROLE, roles.treasury1.address);
      await treasuryManager.connect(roles.treasury1).addTreasuryWallet(
        roles.treasury2.address,
        "Treasury Wallet 1"
      );

      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      const initialTokenBalance = await testToken.balanceOf(roles.treasury2.address);

      await treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
        await testToken.getAddress(),
        serviceFeeBalance,
        roles.treasury2.address
      );

      // Check service fee balance updated
      expect(await storage.serviceFeeBalances(await testToken.getAddress()))
        .to.equal(0);

      // Check token transfer
      const finalTokenBalance = await testToken.balanceOf(roles.treasury2.address);
      expect(finalTokenBalance).to.equal(initialTokenBalance + serviceFeeBalance);
    });

    it("Should prevent excessive withdrawal", async function () {
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const excessiveAmount = commerceBalance + ethers.parseEther("1");

      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
          await testToken.getAddress(),
          excessiveAmount,
          roles.commerce1.address
        )
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("7. Analytics & Reporting", function () {
    beforeEach(async function () {
      // Set up and process multiple payments for analytics
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addTokenToWhitelist(await testToken2.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);

      // Create and pay multiple invoices
      for (let i = 1; i <= 3; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`invoice-${i}`));
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
        ];

        await invoiceManager.connect(roles.owner).createInvoice(
          invoiceId,
          roles.payer1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          ethers.parseEther("100")
        );
      }
    });

    it("Should get commerce tokens", async function () {
      const tokens = await paymentProcessor.getCommerceTokens(roles.commerce1.address);
      expect(tokens).to.include(await testToken.getAddress());
    });

    it("Should get commerce revenue", async function () {
      const revenue = await paymentProcessor.getCommerceRevenue(
        roles.commerce1.address,
        await testToken.getAddress()
      );
      expect(revenue).to.be.gt(0);
    });

    it("Should get all commerce revenues", async function () {
      const result = await paymentProcessor.getCommerceAllRevenues(roles.commerce1.address);
      expect(result.tokens.length).to.be.gt(0);
      expect(result.totalRevenues.length).to.equal(result.tokens.length);
      expect(result.netRevenues.length).to.equal(result.tokens.length);
    });

    it("Should get withdrawal statistics", async function () {
      // Process a withdrawal first
      const balance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress(),
        balance,
        roles.commerce1.address
      );

      const stats = await withdrawalManager.getCommerceWithdrawalStats(
        roles.commerce1.address,
        await testToken.getAddress()
      );
      expect(stats.totalAmount).to.equal(balance);
      expect(stats.totalCount).to.equal(1);
    });
  });

  describe("8. Emergency & Security Features", function () {
    it("Should pause and unpause system", async function () {
      await proxy.pause();
      expect(await proxy.paused()).to.be.true;

      await proxy.unpause();
      expect(await proxy.paused()).to.be.false;
    });

    it("Should handle emergency scenarios", async function () {
      await proxy.pause();

      // Try to create invoice while paused
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("emergency-invoice"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      await expect(
        proxy.createInvoice(
          invoiceId,
          roles.payer1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should update modules", async function () {
      const newStorage = await (await ethers.getContractFactory("DerampStorage")).deploy();
      
      await proxy.setStorageContract(await newStorage.getAddress());
      expect(await proxy.storageContract()).to.equal(await newStorage.getAddress());
    });
  });

  describe("9. Edge Cases & Error Handling", function () {
    it("Should handle zero amounts", async function () {
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);

      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("zero-invoice"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: 0 }
      ];

      await expect(
        invoiceManager.connect(roles.owner).createInvoice(
          invoiceId,
          roles.payer1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should handle expired invoices", async function () {
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);

      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("expired-invoice"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      // Create invoice with past expiry
      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      );

      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          ethers.parseEther("100")
        )
      ).to.be.revertedWith("Invoice expired");
    });

    it("Should handle insufficient token balance", async function () {
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);

      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("insufficient-invoice"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("10000") } // More than balance
      ];

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          ethers.parseEther("10000")
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });

  describe("10. Integration & End-to-End Tests", function () {
    it("Should complete full payment cycle", async function () {
      // Setup
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);
      
      const TREASURY_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURY_MANAGER_ROLE"));
      await accessManager.grantRole(TREASURY_MANAGER_ROLE, roles.treasury1.address);
      await treasuryManager.connect(roles.treasury1).addTreasuryWallet(
        roles.treasury2.address,
        "Main Treasury"
      );

      // Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("full-cycle-invoice"));
      const paymentAmount = ethers.parseEther("100");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.owner).createInvoice(
        invoiceId,
        roles.payer1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      // Pay invoice
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      // Withdraw commerce balance
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress(),
        commerceBalance,
        roles.commerce1.address
      );

      // Withdraw service fees
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      await treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
        await testToken.getAddress(),
        serviceFeeBalance,
        roles.treasury2.address
      );

      // Verify final state
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
      
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });

    it("Should handle multiple concurrent operations", async function () {
      await accessManager.addTokenToWhitelist(await testToken.getAddress());
      await accessManager.addCommerceToWhitelist(roles.commerce1.address);

      // Create multiple invoices concurrently
      const promises = [];
      for (let i = 1; i <= 5; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`concurrent-invoice-${i}`));
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: ethers.parseEther("10") }
        ];

        promises.push(
          invoiceManager.connect(roles.owner).createInvoice(
            invoiceId,
            roles.payer1.address,
            paymentOptions,
            Math.floor(Date.now() / 1000) + 3600
          )
        );
      }

      await Promise.all(promises);

      // Verify all invoices created
      expect(await invoiceManager.getCommerceInvoiceCount(roles.commerce1.address)).to.equal(5);
    });
  });
}); 