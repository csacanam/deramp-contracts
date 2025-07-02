import { expect } from "chai";
import { ethers } from "hardhat";
import { 
  DerampStorage, 
  AccessManager, 
  InvoiceManager, 
  PaymentProcessor, 
  TreasuryManager, 
  WithdrawalManager, 
  DerampProxy 
} from "../typechain-types";
import { setupTestRoles, grantRoles, setupWhitelists, TestRoles, ROLE_CONSTANTS } from "./test-setup";

describe("Deramp System - Complete Business Integration Tests", function () {
  let storage: DerampStorage;
  let accessManager: AccessManager;
  let invoiceManager: InvoiceManager;
  let paymentProcessor: PaymentProcessor;
  let treasuryManager: TreasuryManager;
  let withdrawalManager: WithdrawalManager;
  let proxy: DerampProxy;
  let roles: TestRoles;

  let testToken: any;
  let testToken2: any;

  const DEFAULT_FEE = 100; // 1%

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

    const TreasuryManager = await ethers.getContractFactory("TreasuryManager");
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
    await storage.setModule("TreasuryManager", await treasuryManager.getAddress());
    await storage.setModule("WithdrawalManager", await withdrawalManager.getAddress());

    // Grant roles and setup whitelists
    await grantRoles(accessManager, roles);
    await setupWhitelists(accessManager, roles, [await testToken.getAddress(), await testToken2.getAddress()]);

    // Mint tokens for testing
    await testToken.mint(roles.payer1.address, ethers.parseEther("10000"));
    await testToken2.mint(roles.payer1.address, ethers.parseEther("10000"));
    
    // Approve tokens for payment processor
    await testToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("10000"));
    await testToken2.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("10000"));

    // Mint tokens to withdrawal manager for withdrawals
    await testToken.mint(await withdrawalManager.getAddress(), ethers.parseEther("10000"));
    await testToken2.mint(await withdrawalManager.getAddress(), ethers.parseEther("10000"));
  });

  describe("✅ Complete E2E Business Flow", function () {
    it("Should execute full commerce onboarding to revenue withdrawal cycle", async function () {
      // 1. System Setup Verification
      expect(await proxy.storageContract()).to.equal(await storage.getAddress());
      expect(await proxy.accessManager()).to.equal(await accessManager.getAddress());
      expect(await proxy.invoiceManager()).to.equal(await invoiceManager.getAddress());
      expect(await proxy.paymentProcessor()).to.equal(await paymentProcessor.getAddress());
      expect(await proxy.treasuryManager()).to.equal(await treasuryManager.getAddress());
      expect(await proxy.withdrawalManager()).to.equal(await withdrawalManager.getAddress());

      // 2. Commerce Onboarding (already done in beforeEach via setupWhitelists)
      expect(await accessManager.isCommerceWhitelisted(roles.commerce1.address)).to.be.true;
      expect(await accessManager.isTokenWhitelisted(await testToken.getAddress())).to.be.true;
      expect(await accessManager.isTokenWhitelisted(await testToken2.getAddress())).to.be.true;

      // 3. Treasury Setup
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Main Treasury");
      expect(await treasuryManager.isTreasuryWalletActive(roles.treasury1.address)).to.be.true;

      // 4. Invoice Creation and Payment Flow
      const businessTransactions = [
        { id: "e2e-001", amount: ethers.parseEther("1000"), token: testToken },
        { id: "e2e-002", amount: ethers.parseEther("750"), token: testToken2 },
        { id: "e2e-003", amount: ethers.parseEther("500"), token: testToken }
      ];

      for (const tx of businessTransactions) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(tx.id));
        const paymentOptions = [
          { token: await tx.token.getAddress(), amount: tx.amount }
        ];

        // Commerce creates invoice
        await invoiceManager.connect(roles.commerce1).createInvoice(
          invoiceId,
          roles.commerce1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        // Customer pays invoice
        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await tx.token.getAddress(),
          tx.amount
        );

        // Verify payment processed
        const invoice = await storage.invoices(invoiceId);
        expect(invoice.status).to.equal(1); // PAID
        expect(invoice.payer).to.equal(roles.payer1.address);
      }

      // 5. Commerce Revenue Withdrawal
      const testTokenBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const testToken2Balance = await storage.balances(roles.commerce1.address, await testToken2.getAddress());

      expect(testTokenBalance).to.be.gt(0);
      expect(testToken2Balance).to.be.gt(0);

      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken2.getAddress());

      // Verify commerce balances cleared
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.balances(roles.commerce1.address, await testToken2.getAddress())).to.equal(0);

      // 6. Treasury Service Fee Collection
      const testTokenServiceFees = await storage.serviceFeeBalances(await testToken.getAddress());
      const testToken2ServiceFees = await storage.serviceFeeBalances(await testToken2.getAddress());

      expect(testTokenServiceFees).to.be.gt(0);
      expect(testToken2ServiceFees).to.be.gt(0);

      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // Verify service fees collected
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken2.getAddress())).to.equal(0);

      // 7. Final State Verification
      expect(await testToken.balanceOf(roles.treasury1.address)).to.be.gt(0);
      expect(await testToken2.balanceOf(roles.treasury1.address)).to.be.gt(0);
      expect(await testToken.balanceOf(roles.commerce1.address)).to.be.gt(0);
      expect(await testToken2.balanceOf(roles.commerce1.address)).to.be.gt(0);
    });

    it("Should handle multi-commerce business operations simultaneously", async function () {
      // Set up treasury
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Multi-Commerce Treasury");

      // Multi-commerce transactions
      const multiCommerceTransactions = [
        { id: "multi-001", amount: ethers.parseEther("2000"), commerce: roles.commerce1, token: testToken },
        { id: "multi-002", amount: ethers.parseEther("1500"), commerce: roles.commerce2, token: testToken },
        { id: "multi-003", amount: ethers.parseEther("1000"), commerce: roles.commerce1, token: testToken2 },
        { id: "multi-004", amount: ethers.parseEther("800"), commerce: roles.commerce2, token: testToken2 }
      ];

      // Process all transactions
      for (const tx of multiCommerceTransactions) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(tx.id));
        const paymentOptions = [
          { token: await tx.token.getAddress(), amount: tx.amount }
        ];

        await invoiceManager.connect(tx.commerce).createInvoice(
          invoiceId,
          tx.commerce.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await tx.token.getAddress(),
          tx.amount
        );
      }

      // Verify revenue analytics across commerces
      const commerce1TestTokenRevenue = await proxy.getCommerceRevenue(
        roles.commerce1.address,
        await testToken.getAddress()
      );
      const commerce2TestTokenRevenue = await proxy.getCommerceRevenue(
        roles.commerce2.address,
        await testToken.getAddress()
      );

      expect(commerce1TestTokenRevenue.totalRevenue).to.equal(ethers.parseEther("2000"));
      expect(commerce2TestTokenRevenue.totalRevenue).to.equal(ethers.parseEther("1500"));

      // Verify token diversity per commerce
      const commerce1Tokens = await proxy.getCommerceTokens(roles.commerce1.address);
      const commerce2Tokens = await proxy.getCommerceTokens(roles.commerce2.address);

      expect(commerce1Tokens.length).to.equal(2);
      expect(commerce2Tokens.length).to.equal(2);
      expect(commerce1Tokens).to.include(await testToken.getAddress());
      expect(commerce1Tokens).to.include(await testToken2.getAddress());

      // Process withdrawals for both commerces
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken2.getAddress());
      await withdrawalManager.connect(roles.commerce2).withdrawAllCommerceBalance(await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce2).withdrawAllCommerceBalance(await testToken2.getAddress());

      // Collect all service fees
      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // Verify system state reset
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.balances(roles.commerce2.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken2.getAddress())).to.equal(0);
    });

    it("Should handle complex invoice scenarios with refunds", async function () {
      // Set up treasury
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Refund Scenario Treasury");

      // Create multiple invoices
      const invoiceScenarios = [
        { id: "refund-001", amount: ethers.parseEther("1000"), shouldRefund: false },
        { id: "refund-002", amount: ethers.parseEther("750"), shouldRefund: true },
        { id: "refund-003", amount: ethers.parseEther("500"), shouldRefund: false }
      ];

      const invoiceIds = [];

      // Create and pay all invoices
      for (const scenario of invoiceScenarios) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(scenario.id));
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: scenario.amount }
        ];

        await invoiceManager.connect(roles.commerce1).createInvoice(
          invoiceId,
          roles.commerce1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          scenario.amount
        );

        invoiceIds.push({ id: invoiceId, ...scenario });
      }

      // Process refunds
      const initialPayerBalance = await testToken.balanceOf(roles.payer1.address);
      let refundedAmount = 0n;

      for (const invoice of invoiceIds) {
        if (invoice.shouldRefund) {
          await paymentProcessor.refundInvoice(invoice.id);
          refundedAmount += invoice.amount;

          // Verify invoice status
          const invoiceData = await storage.invoices(invoice.id);
          expect(invoiceData.status).to.equal(2); // REFUNDED
        }
      }

      // Verify refund processed
      const finalPayerBalance = await testToken.balanceOf(roles.payer1.address);
      expect(finalPayerBalance).to.equal(initialPayerBalance + refundedAmount);

      // Verify commerce balance reflects only non-refunded amounts
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const expectedBalance = ethers.parseEther("1000") + ethers.parseEther("500"); // Non-refunded amounts
      const expectedFee = (expectedBalance * BigInt(DEFAULT_FEE)) / BigInt(10000);
      const expectedNetBalance = expectedBalance - expectedFee;

      expect(commerceBalance).to.equal(expectedNetBalance);

      // Complete withdrawal cycle
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken.getAddress());
      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // Verify final state
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
    });
  });

  describe("❌ Failed System Integration Scenarios", function () {
    it("Should prevent unauthorized system administration", async function () {
      // Unauthorized proxy configuration
      const unauthorizedProxy = proxy.connect(roles.unauthorized);

      await expect(
        unauthorizedProxy.setStorageContract(roles.unauthorized.address)
      ).to.be.revertedWith("Not owner");

      await expect(
        unauthorizedProxy.setAccessManager(roles.unauthorized.address)
      ).to.be.revertedWith("Not owner");

      // Unauthorized access control
      await expect(
        accessManager.connect(roles.unauthorized).addTokenToWhitelist(await testToken.getAddress())
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");

      await expect(
        accessManager.connect(roles.unauthorized).addCommerceToWhitelist(roles.unauthorized.address)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });

    it("Should prevent operations with non-whitelisted entities", async function () {
      // Deploy new token (not whitelisted)
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const nonWhitelistedToken = await MockERC20.deploy("Non-Whitelisted Token", "NWT", 18);
      await nonWhitelistedToken.mint(roles.payer1.address, ethers.parseEther("1000"));
      await nonWhitelistedToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));

      // Attempt to create invoice with non-whitelisted token
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invalid-token-invoice"));
      const paymentOptions = [
        { token: await nonWhitelistedToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      await expect(
        invoiceManager.connect(roles.commerce1).createInvoice(
          invoiceId,
          roles.commerce1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWith("Token not whitelisted");

      // Attempt to create invoice for non-whitelisted commerce
      const validPaymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      await expect(
        invoiceManager.connect(roles.unauthorized).createInvoice(
          invoiceId,
          roles.unauthorized.address,
          validPaymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWith("Commerce not whitelisted");
    });

    it("Should handle payment failures gracefully", async function () {
      // Create valid invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("payment-failure-test"));
      const paymentAmount = ethers.parseEther("100");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
        invoiceId,
        roles.commerce1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      // Attempt payment with insufficient amount
      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          ethers.parseEther("50") // Less than required
        )
      ).to.be.revertedWith("Insufficient payment amount");

      // Attempt payment with wrong token
      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken2.getAddress(),
          paymentAmount
        )
      ).to.be.revertedWith("Invalid payment option");

      // Verify invoice remains unpaid
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(0); // PENDING
      expect(invoice.payer).to.equal(ethers.ZeroAddress);
    });

    it("Should prevent withdrawal operations without proper balances", async function () {
      // Attempt to withdraw without any commerce balance
      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken.getAddress())
      ).to.be.revertedWith("No balance to withdraw");

      // Set up treasury but attempt withdrawal without service fees
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Empty Treasury");

      // Should not fail but should have no effect
      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // Verify no tokens transferred
      expect(await testToken.balanceOf(roles.treasury1.address)).to.equal(0);
      expect(await testToken2.balanceOf(roles.treasury1.address)).to.equal(0);
    });
  });

  describe("🔧 System Administration and Maintenance", function () {
    it("Should handle system-wide pause for maintenance", async function () {
      // Set up some initial state
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Maintenance Treasury");

      // Pause all modules
      await accessManager.pause();
      await invoiceManager.pause();
      await paymentProcessor.pause();
      await treasuryManager.pause();
      await withdrawalManager.pause();

      // Verify all modules are paused
      expect(await accessManager.paused()).to.be.true;
      expect(await invoiceManager.paused()).to.be.true;
      expect(await paymentProcessor.paused()).to.be.true;
      expect(await treasuryManager.paused()).to.be.true;
      expect(await withdrawalManager.paused()).to.be.true;

      // Verify operations fail during maintenance
      await expect(
        accessManager.connect(roles.tokenManager).addTokenToWhitelist(roles.unauthorized.address)
      ).to.be.revertedWithCustomError(accessManager, "EnforcedPause");

      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("maintenance-invoice"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: ethers.parseEther("100") }
      ];

      await expect(
        invoiceManager.connect(roles.commerce1).createInvoice(
          invoiceId,
          roles.commerce1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWithCustomError(invoiceManager, "EnforcedPause");

      // Resume operations
      await accessManager.unpause();
      await invoiceManager.unpause();
      await paymentProcessor.unpause();
      await treasuryManager.unpause();
      await withdrawalManager.unpause();

      // Verify normal operations resume
      await accessManager.connect(roles.tokenManager).addTokenToWhitelist(roles.unauthorized.address);
      expect(await accessManager.isTokenWhitelisted(roles.unauthorized.address)).to.be.true;

      await invoiceManager.connect(roles.commerce1).createInvoice(
        invoiceId,
        roles.commerce1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.id).to.equal(invoiceId);
    });

    it("Should prevent unauthorized system administration", async function () {
      // Unauthorized pause attempts
      await expect(
        accessManager.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");

      await expect(
        invoiceManager.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");

      await expect(
        paymentProcessor.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");

      // Unauthorized proxy management
      await expect(
        proxy.connect(roles.unauthorized).setStorageContract(roles.unauthorized.address)
      ).to.be.revertedWith("Not owner");

      await expect(
        proxy.connect(roles.unauthorized).setAccessManager(roles.unauthorized.address)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("📊 System Analytics and Monitoring", function () {
    it("Should provide comprehensive system analytics", async function () {
      // Set up treasury
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Analytics Treasury");

      // Generate diverse business activity
      const analyticsScenarios = [
        { id: "analytics-001", amount: ethers.parseEther("1000"), commerce: roles.commerce1, token: testToken },
        { id: "analytics-002", amount: ethers.parseEther("750"), commerce: roles.commerce2, token: testToken },
        { id: "analytics-003", amount: ethers.parseEther("500"), commerce: roles.commerce1, token: testToken2 },
        { id: "analytics-004", amount: ethers.parseEther("300"), commerce: roles.commerce2, token: testToken2 }
      ];

      // Process all transactions
      for (const scenario of analyticsScenarios) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(scenario.id));
        const paymentOptions = [
          { token: await scenario.token.getAddress(), amount: scenario.amount }
        ];

        await invoiceManager.connect(scenario.commerce).createInvoice(
          invoiceId,
          scenario.commerce.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await scenario.token.getAddress(),
          scenario.amount
        );
      }

      // Verify comprehensive analytics
      const commerce1AllRevenues = await proxy.getCommerceAllRevenues(roles.commerce1.address);
      const commerce2AllRevenues = await proxy.getCommerceAllRevenues(roles.commerce2.address);

      expect(commerce1AllRevenues.tokens.length).to.equal(2);
      expect(commerce2AllRevenues.tokens.length).to.equal(2);

      // Verify token-specific analytics
      const commerce1TestTokenRevenue = await proxy.getCommerceRevenue(
        roles.commerce1.address,
        await testToken.getAddress()
      );
      expect(commerce1TestTokenRevenue.totalRevenue).to.equal(ethers.parseEther("1000"));

      // Process some withdrawals for analytics
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken.getAddress());
      
      // Verify withdrawal analytics
      const withdrawalStats = await withdrawalManager.getCommerceWithdrawalStats(
        roles.commerce1.address
      );
      expect(withdrawalStats.totalWithdrawals).to.equal(1);

      // Collect service fees
      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // Verify treasury analytics
      const serviceStats = await treasuryManager.getServiceFeeWithdrawalStats();
      expect(serviceStats.totalWithdrawals).to.be.gt(0);
    });

    it("Should track system state consistency", async function () {
      // Generate business activity
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("consistency-test"));
      const paymentAmount = ethers.parseEther("1000");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
        invoiceId,
        roles.commerce1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      // Verify state consistency
      const expectedFee = (paymentAmount * BigInt(DEFAULT_FEE)) / BigInt(10000);
      const expectedCommerceBalance = paymentAmount - expectedFee;

      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(expectedCommerceBalance);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(expectedFee);

      // Verify invoice state
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
      expect(invoice.paidAmount).to.equal(paymentAmount);
      expect(invoice.payer).to.equal(roles.payer1.address);

      // Process withdrawals and verify consistency
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(await testToken.getAddress());
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);

      // Set up and collect service fees
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Consistency Treasury");
      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);

      // Final consistency check
      expect(await testToken.balanceOf(roles.commerce1.address)).to.equal(expectedCommerceBalance);
      expect(await testToken.balanceOf(roles.treasury1.address)).to.equal(expectedFee);
    });
  });
}); 