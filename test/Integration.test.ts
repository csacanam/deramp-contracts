import { expect } from "chai";
import { ethers } from "hardhat";
import { 
  DerampProxy,
  DerampStorage, 
  AccessManager,
  InvoiceManager,
  PaymentProcessor,
  TreasuryManagerClean,
  WithdrawalManager
} from "../typechain-types";
import { setupTestRoles, grantRoles, setupWhitelists, TestRoles, ROLE_CONSTANTS } from "./test-setup";

describe("Deramp System Integration", function () {
  let proxy: DerampProxy;
  let storage: DerampStorage;
  let accessManager: AccessManager;
  let invoiceManager: InvoiceManager;
  let paymentProcessor: PaymentProcessor;
  let treasuryManager: TreasuryManagerClean;
  let withdrawalManager: WithdrawalManager;
  let testToken: any;
  let testToken2: any;
  let roles: TestRoles;

  beforeEach(async function () {
    // Setup standardized roles
    roles = await setupTestRoles();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    testToken = await MockERC20.deploy("Test Token", "TEST", 18);
    testToken2 = await MockERC20.deploy("Test Token 2", "TEST2", 18);

    // Deploy all modules
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

    // Grant roles and setup whitelists using standardized functions
    await grantRoles(accessManager, roles);
    await setupWhitelists(accessManager, roles, [await testToken.getAddress(), await testToken2.getAddress()]);

    // Mint tokens to payers
    await testToken.mint(roles.payer1.address, ethers.parseEther("1000"));
    await testToken.mint(roles.payer2.address, ethers.parseEther("1000"));
    await testToken2.mint(roles.payer1.address, ethers.parseEther("1000"));
    await testToken2.mint(roles.payer2.address, ethers.parseEther("1000"));

    // Approve tokens
    await testToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));
    await testToken.connect(roles.payer2).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));
    await testToken2.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));
    await testToken2.connect(roles.payer2).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));

    // Mint tokens to withdrawal manager for withdrawals
    await testToken.mint(await withdrawalManager.getAddress(), ethers.parseEther("2000"));
    await testToken2.mint(await withdrawalManager.getAddress(), ethers.parseEther("2000"));

    // Set up treasury
    await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasuryManager.address, "Main Treasury");
  });

  describe("Proxy Functionality", function () {
    it("Should have all modules properly configured", async function () {
      expect(await proxy.storageContract()).to.equal(await storage.getAddress());
      expect(await proxy.accessManager()).to.equal(await accessManager.getAddress());
      expect(await proxy.invoiceManager()).to.equal(await invoiceManager.getAddress());
      expect(await proxy.paymentProcessor()).to.equal(await paymentProcessor.getAddress());
      expect(await proxy.treasuryManager()).to.equal(await treasuryManager.getAddress());
      expect(await proxy.withdrawalManager()).to.equal(await withdrawalManager.getAddress());
    });

    it("Should update modules", async function () {
      const newStorage = await (await ethers.getContractFactory("DerampStorage")).deploy();
      
      await expect(
        proxy.setStorageContract(await newStorage.getAddress())
      ).to.emit(proxy, "ModuleUpdated")
        .withArgs("storage", await storage.getAddress(), await newStorage.getAddress());

      expect(await proxy.storageContract()).to.equal(await newStorage.getAddress());
    });

    it("Should prevent unauthorized module updates", async function () {
      const newStorage = await (await ethers.getContractFactory("DerampStorage")).deploy();
      
      await expect(
        proxy.connect(roles.unauthorized).setStorageContract(await newStorage.getAddress())
      ).to.be.revertedWithCustomError(proxy, "OwnableUnauthorizedAccount");
    });

    it("Should handle emergency pause", async function () {
      await expect(proxy.pause())
        .to.emit(proxy, "Emergency")
        .withArgs("Contract paused by owner");

      expect(await proxy.paused()).to.be.true;

      await proxy.unpause();
      expect(await proxy.paused()).to.be.false;
    });
  });

  describe("Complete Payment Cycles", function () {
    it("Should handle single commerce complete cycle", async function () {
      // 1. Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("cycle-invoice"));
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

      // 2. Pay invoice
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      // 3. Verify balances
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      
      expect(commerceBalance).to.be.gt(0);
      expect(serviceFeeBalance).to.be.gt(0);
      expect(commerceBalance + serviceFeeBalance).to.equal(paymentAmount);

      // 4. Withdraw commerce balance
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress()
      );

      // 5. Withdraw service fees
      await treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
        await testToken.getAddress(),
        roles.treasury1.address
      );

      // 6. Verify final state
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
    });

    it("Should handle multiple commerce parallel operations", async function () {
      const invoices = [
        { commerce: roles.commerce1, payer: roles.payer1, amount: ethers.parseEther("100"), id: "parallel-1" },
        { commerce: roles.commerce2, payer: roles.payer2, amount: ethers.parseEther("200"), id: "parallel-2" },
        { commerce: roles.commerce1, payer: roles.payer2, amount: ethers.parseEther("150"), id: "parallel-3" }
      ];

      // Create all invoices
      for (const inv of invoices) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(inv.id));
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: inv.amount }
        ];

        await invoiceManager.connect(roles.owner).createInvoice(
          invoiceId,
          inv.commerce.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );
      }

      // Pay all invoices
      for (const inv of invoices) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(inv.id));
        await paymentProcessor.connect(inv.payer).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          inv.amount
        );
      }

      // Verify commerce balances
      const commerce1Balance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const commerce2Balance = await storage.balances(roles.commerce2.address, await testToken.getAddress());
      
      expect(commerce1Balance).to.be.gt(0);
      expect(commerce2Balance).to.be.gt(0);

      // Verify analytics
      const commerce1Tokens = await paymentProcessor.getCommerceTokens(roles.commerce1.address);
      const commerce2Tokens = await paymentProcessor.getCommerceTokens(roles.commerce2.address);
      
      expect(commerce1Tokens).to.include(await testToken.getAddress());
      expect(commerce2Tokens).to.include(await testToken.getAddress());

      expect(await invoiceManager.getCommerceInvoiceCount(roles.commerce1.address)).to.equal(2);
      expect(await invoiceManager.getCommerceInvoiceCount(roles.commerce2.address)).to.equal(1);
    });

    it("Should handle multi-token operations", async function () {
      const invoices = [
        { token: testToken, amount: ethers.parseEther("100"), id: "multi-token-1" },
        { token: testToken2, amount: ethers.parseEther("200"), id: "multi-token-2" }
      ];

      for (const inv of invoices) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(inv.id));
        const paymentOptions = [
          { token: await inv.token.getAddress(), amount: inv.amount }
        ];

        await invoiceManager.connect(roles.owner).createInvoice(
          invoiceId,
          roles.payer1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await inv.token.getAddress(),
          inv.amount
        );
      }

      // Verify multi-token analytics
      const allRevenues = await paymentProcessor.getCommerceAllRevenues(roles.commerce1.address);
      expect(allRevenues.tokens.length).to.equal(2);
      expect(allRevenues.tokens).to.include(await testToken.getAddress());
      expect(allRevenues.tokens).to.include(await testToken2.getAddress());
    });
  });

  describe("Refund Scenarios", function () {
    it("Should handle refund in complete cycle", async function () {
      // Create and pay invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("refund-cycle"));
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

      const initialPayerBalance = await testToken.balanceOf(roles.payer1.address);

      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      // Verify payment processed
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID

      // Process refund
      await paymentProcessor.connect(roles.owner).refundInvoice(invoiceId);

      // Verify refund
      const refundedInvoice = await storage.invoices(invoiceId);
      expect(refundedInvoice.status).to.equal(2); // REFUNDED

      const finalPayerBalance = await testToken.balanceOf(roles.payer1.address);
      expect(finalPayerBalance).to.equal(initialPayerBalance);

      // Verify balances are cleared
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
    });

    it("Should handle partial refunds with multiple invoices", async function () {
      const invoices = [
        { id: "partial-1", amount: ethers.parseEther("100") },
        { id: "partial-2", amount: ethers.parseEther("200") }
      ];

      // Create and pay both invoices
      for (const inv of invoices) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(inv.id));
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: inv.amount }
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
          inv.amount
        );
      }

      // Refund only first invoice
      const firstInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("partial-1"));
      await paymentProcessor.connect(roles.owner).refundInvoice(firstInvoiceId);

      // Verify partial refund
      const firstInvoice = await storage.invoices(firstInvoiceId);
      const secondInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("partial-2"));
      const secondInvoice = await storage.invoices(secondInvoiceId);

      expect(firstInvoice.status).to.equal(2); // REFUNDED
      expect(secondInvoice.status).to.equal(1); // PAID

      // Commerce should still have balance from second invoice
      const remainingBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      expect(remainingBalance).to.be.gt(0);
    });
  });

  describe("High Volume Scenarios", function () {
    it("Should handle high volume of transactions", async function () {
      const transactionCount = 20;
      const baseAmount = ethers.parseEther("50");

      // Create multiple invoices
      for (let i = 0; i < transactionCount; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`volume-${i}`));
        const amount = baseAmount + ethers.parseEther((i * 10).toString());
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: amount }
        ];

        const payer = i % 2 === 0 ? roles.payer1 : roles.payer2;
        const commerce = i % 3 === 0 ? roles.commerce1 : roles.commerce2;

        await invoiceManager.connect(roles.owner).createInvoice(
          invoiceId,
          commerce.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(payer).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          amount
        );
      }

      // Verify high volume analytics
      const commerce1Count = await invoiceManager.getCommerceInvoiceCount(roles.commerce1.address);
      const commerce2Count = await invoiceManager.getCommerceInvoiceCount(roles.commerce2.address);
      
      expect(commerce1Count + commerce2Count).to.equal(transactionCount);

      // Verify balances accumulated
      const commerce1Balance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const commerce2Balance = await storage.balances(roles.commerce2.address, await testToken.getAddress());
      const totalServiceFees = await storage.serviceFeeBalances(await testToken.getAddress());

      expect(commerce1Balance).to.be.gt(0);
      expect(commerce2Balance).to.be.gt(0);
      expect(totalServiceFees).to.be.gt(0);
    });

    it("Should handle concurrent operations", async function () {
      // Simulate concurrent invoice creation and payments
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`concurrent-${i}`));
        const amount = ethers.parseEther("100");
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: amount }
        ];

        const commerce = i % 2 === 0 ? roles.commerce1 : roles.commerce2;
        const payer = i % 2 === 0 ? roles.payer1 : roles.payer2;

        promises.push(
          invoiceManager.connect(roles.owner).createInvoice(
            invoiceId,
            commerce.address,
            paymentOptions,
            Math.floor(Date.now() / 1000) + 3600
          )
        );
      }

      await Promise.all(promises);

      // Pay all invoices concurrently
      const paymentPromises = [];
      for (let i = 0; i < 10; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`concurrent-${i}`));
        const amount = ethers.parseEther("100");
        const payer = i % 2 === 0 ? roles.payer1 : roles.payer2;

        paymentPromises.push(
          paymentProcessor.connect(payer).payInvoice(
            invoiceId,
            await testToken.getAddress(),
            amount
          )
        );
      }

      await Promise.all(paymentPromises);

      // Verify all transactions processed
      expect(await invoiceManager.getCommerceInvoiceCount(roles.commerce1.address)).to.equal(5);
      expect(await invoiceManager.getCommerceInvoiceCount(roles.commerce2.address)).to.equal(5);
    });
  });

  describe("Error Recovery Scenarios", function () {
    it("Should handle failed payments gracefully", async function () {
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("failed-payment"));
      const paymentAmount = ethers.parseEther("2000"); // More than balance
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
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
          paymentAmount
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      // Verify invoice remains unpaid
      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(0); // PENDING
    });

    it("Should handle emergency pause during operations", async function () {
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("emergency-invoice"));
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

      // Emergency pause
      await proxy.pause();

      // Operations should be blocked
      await expect(
        paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await testToken.getAddress(),
          paymentAmount
        )
      ).to.be.revertedWith("Pausable: paused");

      // Resume operations
      await proxy.unpause();

      // Should work after unpause
      await paymentProcessor.connect(roles.payer1).payInvoice(
        invoiceId,
        await testToken.getAddress(),
        paymentAmount
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });
  });

  describe("Analytics and Reporting", function () {
    beforeEach(async function () {
      // Set up comprehensive test data
      const testData = [
        { commerce: roles.commerce1, payer: roles.payer1, token: testToken, amount: ethers.parseEther("100") },
        { commerce: roles.commerce1, payer: roles.payer2, token: testToken, amount: ethers.parseEther("200") },
        { commerce: roles.commerce1, payer: roles.payer1, token: testToken2, amount: ethers.parseEther("150") },
        { commerce: roles.commerce2, payer: roles.payer1, token: testToken, amount: ethers.parseEther("300") },
        { commerce: roles.commerce2, payer: roles.payer2, token: testToken2, amount: ethers.parseEther("250") }
      ];

      for (let i = 0; i < testData.length; i++) {
        const data = testData[i];
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`analytics-${i}`));
        const paymentOptions = [
          { token: await data.token.getAddress(), amount: data.amount }
        ];

        await invoiceManager.connect(roles.owner).createInvoice(
          invoiceId,
          data.commerce.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(data.payer).payInvoice(
          invoiceId,
          await data.token.getAddress(),
          data.amount
        );
      }
    });

    it("Should provide comprehensive commerce analytics", async function () {
      // Commerce 1 analytics
      const commerce1Tokens = await paymentProcessor.getCommerceTokens(roles.commerce1.address);
      expect(commerce1Tokens.length).to.equal(2);

      const commerce1AllRevenues = await paymentProcessor.getCommerceAllRevenues(roles.commerce1.address);
      expect(commerce1AllRevenues.tokens.length).to.equal(2);
      expect(commerce1AllRevenues.totalRevenues.length).to.equal(2);

      // Commerce 2 analytics
      const commerce2Tokens = await paymentProcessor.getCommerceTokens(roles.commerce2.address);
      expect(commerce2Tokens.length).to.equal(2);

      const commerce2AllRevenues = await paymentProcessor.getCommerceAllRevenues(roles.commerce2.address);
      expect(commerce2AllRevenues.tokens.length).to.equal(2);
    });

    it("Should provide system-wide analytics", async function () {
      // Perform some withdrawals for analytics
      const commerce1Balance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress()
      );

      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      await treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
        await testToken.getAddress(),
        roles.treasury1.address
      );

      // Check withdrawal analytics
      const commerce1WithdrawalStats = await withdrawalManager.getCommerceWithdrawalStats(
        roles.commerce1.address
      );
      expect(commerce1WithdrawalStats.totalWithdrawals).to.equal(1);

      const tokenWithdrawalStats = await withdrawalManager.getTotalWithdrawalsByToken(
        await testToken.getAddress()
      );
      expect(tokenWithdrawalStats.totalCount).to.equal(2); // Commerce + service fee
    });
  });

  describe("System Limits and Edge Cases", function () {
    it("Should handle maximum values", async function () {
      // Test with very large amounts (within token supply)
      const largeAmount = ethers.parseEther("500");
      await testToken.mint(roles.payer1.address, largeAmount);
      await testToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), largeAmount);

      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("large-amount"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: largeAmount }
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
        largeAmount
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });

    it("Should handle minimum values", async function () {
      const minAmount = 1; // 1 wei
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("min-amount"));
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: minAmount }
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
        minAmount
      );

      const invoice = await storage.invoices(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });

    it("Should handle system at capacity", async function () {
      // Test with many concurrent operations
      const operationCount = 50;
      const promises = [];

      for (let i = 0; i < operationCount; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`capacity-${i}`));
        const amount = ethers.parseEther("10");
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: amount }
        ];

        const commerce = i % 2 === 0 ? roles.commerce1 : roles.commerce2;
        const payer = i % 2 === 0 ? roles.payer1 : roles.payer2;

        promises.push(
          invoiceManager.connect(roles.owner).createInvoice(
            invoiceId,
            commerce.address,
            paymentOptions,
            Math.floor(Date.now() / 1000) + 3600
          ).then(async () =>
            paymentProcessor.connect(payer).payInvoice(
              invoiceId,
              await testToken.getAddress(),
              amount
            )
          )
        );
      }

      await Promise.all(promises);

      // Verify all operations completed
      const totalInvoices = await invoiceManager.getCommerceInvoiceCount(roles.commerce1.address) +
                           await invoiceManager.getCommerceInvoiceCount(roles.commerce2.address);
      expect(totalInvoices).to.equal(operationCount);
    });
  });
});