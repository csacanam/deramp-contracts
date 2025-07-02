import { expect } from "chai";
import { ethers } from "hardhat";
import { 
  PaymentProcessor, 
  DerampStorage, 
  AccessManager,
  InvoiceManager 
} from "../typechain-types";
import { setupTestRoles, grantRoles, setupWhitelists, TestRoles, ROLE_CONSTANTS } from "./test-setup";

describe("PaymentProcessor - Business Flow Tests", function () {
  let paymentProcessor: PaymentProcessor;
  let storage: DerampStorage;
  let accessManager: AccessManager;
  let invoiceManager: InvoiceManager;
  let testToken: any;
  let testToken2: any;
  let roles: TestRoles;

  const DEFAULT_FEE = 100; // 1%

  beforeEach(async function () {
    // Setup standardized roles
    roles = await setupTestRoles();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    testToken = await MockERC20.deploy("Test Token", "TEST", 18);
    testToken2 = await MockERC20.deploy("Test Token 2", "TEST2", 18);

    // Deploy core contracts
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

    // Set up permissions
    await storage.setModule("PaymentProcessor", await paymentProcessor.getAddress());
    await storage.setModule("InvoiceManager", await invoiceManager.getAddress());
    await storage.setModule("AccessManager", await accessManager.getAddress());

    // Grant roles and setup whitelists
    await grantRoles(accessManager, roles);
    await setupWhitelists(accessManager, roles, [await testToken.getAddress(), await testToken2.getAddress()]);

    // Mint and approve tokens for payers
    await testToken.mint(roles.payer1.address, ethers.parseEther("10000"));
    await testToken2.mint(roles.payer1.address, ethers.parseEther("10000"));
    await testToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("10000"));
    await testToken2.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("10000"));
  });

  describe("✅ Successful Payment Flow", function () {
    it("Should complete full payment flow with proper fee distribution", async function () {
      // 1. Commerce creates invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("business-invoice-001"));
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

      // 2. Customer pays invoice
      const initialPayerBalance = await testToken.balanceOf(roles.payer1.address);
      
      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          paymentAmount
        )
      ).to.emit(paymentProcessor, "InvoicePaid")
        .withArgs(invoiceId, roles.payer1.address, await testToken.getAddress(), paymentAmount);

      // 3. Verify payment state
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
      expect(invoice.payer).to.equal(roles.payer1.address);
      expect(invoice.paidAmount).to.equal(paymentAmount);

      // 4. Verify financial flows
      const expectedFee = (paymentAmount * BigInt(DEFAULT_FEE)) / BigInt(10000);
      const expectedCommerceAmount = paymentAmount - expectedFee;
      
      expect(await testToken.balanceOf(roles.payer1.address)).to.equal(initialPayerBalance - paymentAmount);
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(expectedCommerceAmount);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(expectedFee);
    });

    it("Should handle multi-token commerce revenue tracking", async function () {
      // Create invoices with different tokens
      const invoices = [
        { id: "multi-token-1", amount: ethers.parseEther("500"), token: testToken },
        { id: "multi-token-2", amount: ethers.parseEther("300"), token: testToken2 },
        { id: "multi-token-3", amount: ethers.parseEther("200"), token: testToken }
      ];

      // Process all payments
      for (const inv of invoices) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(inv.id));
        const paymentOptions = [
          { token: await inv.token.getAddress(), amount: inv.amount }
        ];

        await invoiceManager.connect(roles.commerce1).createInvoice(
          invoiceId,
          roles.commerce1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await inv.token.getAddress(),
          inv.amount
        );
      }

      // Verify revenue analytics
      const tokens = await paymentProcessor.getCommerceTokens(roles.commerce1.address);
      expect(tokens.length).to.equal(2);
      expect(tokens).to.include(await testToken.getAddress());
      expect(tokens).to.include(await testToken2.getAddress());

      // Check testToken revenue (500 + 200 = 700)
      const testTokenRevenue = await paymentProcessor.getCommerceRevenue(
        roles.commerce1.address,
        await testToken.getAddress()
      );
      expect(testTokenRevenue.totalRevenue).to.equal(ethers.parseEther("700"));

      // Check testToken2 revenue (300)
      const testToken2Revenue = await paymentProcessor.getCommerceRevenue(
        roles.commerce1.address,
        await testToken2.getAddress()
      );
      expect(testToken2Revenue.totalRevenue).to.equal(ethers.parseEther("300"));
    });

    it("Should process refund flow correctly", async function () {
      // 1. Create and pay invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("refund-flow-001"));
      const paymentAmount = ethers.parseEther("500");
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

      // 2. Process refund
      const initialPayerBalance = await testToken.balanceOf(roles.payer1.address);
      const initialCommerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());

      await expect(
        paymentProcessor.refundInvoice(invoiceId)
      ).to.emit(paymentProcessor, "Refunded")
        .withArgs(invoiceId, roles.payer1.address, await testToken.getAddress(), paymentAmount);

      // 3. Verify refund state
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(2); // REFUNDED

      // 4. Verify financial restoration
      expect(await testToken.balanceOf(roles.payer1.address)).to.equal(initialPayerBalance + paymentAmount);
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
    });
  });

  describe("❌ Failed Payment Flow", function () {
    it("Should prevent payment with insufficient funds", async function () {
      // Create invoice for amount exceeding balance
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("insufficient-funds"));
      const excessiveAmount = ethers.parseEther("20000"); // More than minted
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: excessiveAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
        invoiceId,
        roles.commerce1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          excessiveAmount
        )
      ).to.be.revertedWithCustomError(testToken, "ERC20InsufficientAllowance");
    });

    it("Should prevent payment of expired invoices", async function () {
      // Create expired invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("expired-invoice"));
      const paymentAmount = ethers.parseEther("100");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
        invoiceId,
        roles.commerce1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      );

      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          paymentAmount
        )
      ).to.be.revertedWith("Invoice has expired");
    });

    it("Should prevent double payment attempts", async function () {
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("double-payment"));
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

      // First payment succeeds
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      // Second payment fails
      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          paymentAmount
        )
      ).to.be.revertedWith("Invoice is not pending");
    });

    it("Should prevent payment with incorrect amount", async function () {
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("wrong-amount"));
      const correctAmount = ethers.parseEther("100");
      const wrongAmount = ethers.parseEther("50");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: correctAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
        invoiceId,
        roles.commerce1.address,
        paymentOptions,
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          wrongAmount
        )
      ).to.be.revertedWith("Insufficient payment amount");
    });

    it("Should prevent unauthorized refunds", async function () {
      // Create and pay invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("unauthorized-refund"));
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

      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      // Unauthorized refund attempt
      await expect(
        paymentProcessor.connect(roles.unauthorized).refundInvoice(invoiceId)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("🔧 System Administration Flow", function () {
    it("Should handle system pause for maintenance", async function () {
      // Create invoice first
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("maintenance-test"));
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

      // Pause system
      await paymentProcessor.pause();
      expect(await paymentProcessor.paused()).to.be.true;

      // Payment should fail during maintenance
      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          paymentAmount
        )
      ).to.be.revertedWithCustomError(paymentProcessor, "EnforcedPause");

      // Unpause and verify normal operation
      await paymentProcessor.unpause();
      expect(await paymentProcessor.paused()).to.be.false;

      // Payment should work after maintenance
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });

    it("Should prevent unauthorized system administration", async function () {
      await expect(
        paymentProcessor.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");

      await paymentProcessor.pause();

      await expect(
        paymentProcessor.connect(roles.unauthorized).unpause()
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("📊 Business Analytics Flow", function () {
    it("Should provide comprehensive revenue analytics", async function () {
      // Create diverse payment scenarios
      const scenarios = [
        { commerce: roles.commerce1, amount: ethers.parseEther("1000"), token: testToken },
        { commerce: roles.commerce1, amount: ethers.parseEther("500"), token: testToken2 },
        { commerce: roles.commerce2, amount: ethers.parseEther("750"), token: testToken },
        { commerce: roles.commerce1, amount: ethers.parseEther("250"), token: testToken }
      ];

      // Process all payments
      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`analytics-${i}`));
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

      // Verify analytics
      const tokens = await paymentProcessor.getCommerceTokens(roles.commerce1.address);
      expect(tokens.length).to.equal(2);
      expect(tokens).to.include(await testToken.getAddress());
      expect(tokens).to.include(await testToken2.getAddress());

      // Check testToken revenue (1000 + 250 = 1250)
      const testTokenRevenue = await paymentProcessor.getCommerceRevenue(
        roles.commerce1.address,
        await testToken.getAddress()
      );
      expect(testTokenRevenue.totalRevenue).to.equal(ethers.parseEther("1250"));

      // Check testToken2 revenue (500)
      const testToken2Revenue = await paymentProcessor.getCommerceRevenue(
        roles.commerce1.address,
        await testToken2.getAddress()
      );
      expect(testToken2Revenue.totalRevenue).to.equal(ethers.parseEther("500"));
    });

    it("Should calculate fees correctly across different scenarios", async function () {
      const testAmount = ethers.parseEther("1000");
      
      // Test default fee calculation
      const defaultFee = await paymentProcessor.calculateServiceFee(await testToken.getAddress(), testAmount);
      const expectedDefaultFee = (testAmount * BigInt(DEFAULT_FEE)) / BigInt(10000);
      expect(defaultFee).to.equal(expectedDefaultFee);

      // Test with modified default fee (0.5% - within limit)
      await accessManager.setDefaultFeePercent(50); // 0.5%
      const modifiedFee = await paymentProcessor.calculateServiceFee(await testToken.getAddress(), testAmount);
      const expectedModifiedFee = (testAmount * BigInt(50)) / BigInt(10000);
      expect(modifiedFee).to.equal(expectedModifiedFee);

      // Test zero fee
      await accessManager.setDefaultFeePercent(0);
      const zeroFee = await paymentProcessor.calculateServiceFee(await testToken.getAddress(), testAmount);
      expect(zeroFee).to.equal(0);
    });
  });

  describe("🔄 Edge Cases in Business Flow", function () {
    it("Should handle minimal payment amounts", async function () {
      const minimalAmount = 1; // 1 wei
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("minimal-payment"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: minimalAmount }
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
        minimalAmount
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });

    it("Should handle maximum practical payment amounts", async function () {
      const maxAmount = ethers.parseEther("5000");
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("maximum-payment"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: maxAmount }
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
        maxAmount
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });

    it("Should prevent refund of unpaid invoices", async function () {
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("unpaid-refund"));
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

      await expect(
        paymentProcessor.refundInvoice(invoiceId)
      ).to.be.revertedWith("Invoice is not paid");
    });

    it("Should prevent double refund attempts", async function () {
      // Create, pay, and refund invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("double-refund"));
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

      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      await paymentProcessor.refundInvoice(invoiceId);

      // Second refund attempt should fail
      await expect(
        paymentProcessor.refundInvoice(invoiceId)
      ).to.be.revertedWith("Invoice is not paid");
    });
  });
});