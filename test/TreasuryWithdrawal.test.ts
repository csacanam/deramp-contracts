import { expect } from "chai";
import { ethers } from "hardhat";
import { 
  TreasuryManager, 
  WithdrawalManager,
  DerampStorage, 
  AccessManager,
  InvoiceManager,
  PaymentProcessor
} from "../typechain-types";
import { setupTestRoles, grantRoles, setupWhitelists, TestRoles, ROLE_CONSTANTS } from "./test-setup";

describe("Treasury & Withdrawal - Business Flow Tests", function () {
  let treasuryManager: TreasuryManager;
  let withdrawalManager: WithdrawalManager;
  let storage: DerampStorage;
  let accessManager: AccessManager;
  let invoiceManager: InvoiceManager;
  let paymentProcessor: PaymentProcessor;
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

    // Set up permissions
    await storage.setModule("AccessManager", await accessManager.getAddress());
    await storage.setModule("TreasuryManager", await treasuryManager.getAddress());
    await storage.setModule("WithdrawalManager", await withdrawalManager.getAddress());
    await storage.setModule("PaymentProcessor", await paymentProcessor.getAddress());
    await storage.setModule("InvoiceManager", await invoiceManager.getAddress());

    // Grant roles and setup whitelists
    await grantRoles(accessManager, roles);
    await setupWhitelists(accessManager, roles, [await testToken.getAddress(), await testToken2.getAddress()]);

    // Mint and approve tokens for payments
    await testToken.mint(roles.payer1.address, ethers.parseEther("10000"));
    await testToken2.mint(roles.payer1.address, ethers.parseEther("10000"));
    await testToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("10000"));
    await testToken2.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("10000"));

    // Mint tokens to withdrawal manager for withdrawals
    await testToken.mint(await withdrawalManager.getAddress(), ethers.parseEther("10000"));
    await testToken2.mint(await withdrawalManager.getAddress(), ethers.parseEther("10000"));
  });

  describe("✅ Successful Treasury Management Flow", function () {
    it("Should complete full treasury setup and service fee collection", async function () {
      // 1. Set up treasury wallet
      const treasuryDescription = "Main Treasury Wallet";
      
      await expect(
        treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, treasuryDescription)
      ).to.emit(treasuryManager, "TreasuryWalletAdded")
        .withArgs(roles.treasury1.address, treasuryDescription);

      // 2. Verify treasury wallet configuration
      const treasuryWallet = await storage.treasuryWallets(roles.treasury1.address);
      expect(treasuryWallet.wallet).to.equal(roles.treasury1.address);
      expect(treasuryWallet.isActive).to.be.true;
      expect(treasuryWallet.description).to.equal(treasuryDescription);

      // 3. Generate service fees through business operations
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("treasury-business-001"));
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

      // 4. Collect service fees to treasury
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      const initialTreasuryBalance = await testToken.balanceOf(roles.treasury1.address);
      
      await expect(
        treasuryManager.connect(roles.treasuryManager).withdrawServiceFeesToTreasury(
          await testToken.getAddress(),
          roles.treasury1.address
        )
      ).to.emit(storage, "ServiceFeeWithdrawal")
        .withArgs(await testToken.getAddress(), serviceFeeBalance, roles.treasury1.address);

      // 5. Verify financial flows
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
      expect(await testToken.balanceOf(roles.treasury1.address)).to.equal(initialTreasuryBalance + serviceFeeBalance);
    });

    it("Should manage multiple treasury wallets effectively", async function () {
      // Set up multiple treasury wallets
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Primary Treasury");
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury2.address, "Secondary Treasury");

      // Verify active wallets
      const activeWallets = await treasuryManager.getActiveTreasuryWallets();
      expect(activeWallets.length).to.equal(2);
      expect(activeWallets).to.include(roles.treasury1.address);
      expect(activeWallets).to.include(roles.treasury2.address);

      // Deactivate one wallet
      await treasuryManager.connect(roles.treasuryManager).setTreasuryWalletStatus(roles.treasury2.address, false);
      
      // Verify status changes
      expect(await treasuryManager.isTreasuryWalletActive(roles.treasury1.address)).to.be.true;
      expect(await treasuryManager.isTreasuryWalletActive(roles.treasury2.address)).to.be.false;

      const updatedActiveWallets = await treasuryManager.getActiveTreasuryWallets();
      expect(updatedActiveWallets.length).to.equal(1);
      expect(updatedActiveWallets).to.include(roles.treasury1.address);
      expect(updatedActiveWallets).to.not.include(roles.treasury2.address);
    });

    it("Should handle all service fees withdrawal efficiently", async function () {
      // Set up treasury
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Bulk Withdrawal Treasury");

      // Generate service fees from multiple transactions
      const transactions = [
        { id: "bulk-001", amount: ethers.parseEther("500"), token: testToken },
        { id: "bulk-002", amount: ethers.parseEther("750"), token: testToken },
        { id: "bulk-003", amount: ethers.parseEther("300"), token: testToken2 }
      ];

      for (const tx of transactions) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(tx.id));
        const paymentOptions = [
          { token: await tx.token.getAddress(), amount: tx.amount }
        ];

        await invoiceManager.connect(roles.commerce1).createInvoice(
          invoiceId,
          roles.commerce1.address,
          paymentOptions,
          Math.floor(Date.now() / 1000) + 3600
        );

        await paymentProcessor.connect(roles.payer1).payInvoice(
          invoiceId,
          await tx.token.getAddress(),
          tx.amount
        );
      }

      // Withdraw all service fees at once
      const initialTreasuryTestTokenBalance = await testToken.balanceOf(roles.treasury1.address);
      const initialTreasuryTestToken2Balance = await testToken2.balanceOf(roles.treasury1.address);

      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // Verify all service fees collected
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken2.getAddress())).to.equal(0);
      expect(await testToken.balanceOf(roles.treasury1.address)).to.be.gt(initialTreasuryTestTokenBalance);
      expect(await testToken2.balanceOf(roles.treasury1.address)).to.be.gt(initialTreasuryTestToken2Balance);
    });
  });

  describe("✅ Successful Commerce Withdrawal Flow", function () {
    beforeEach(async function () {
      // Generate commerce balances through payments
      const invoices = [
        { id: "commerce-revenue-001", amount: ethers.parseEther("1000"), token: testToken },
        { id: "commerce-revenue-002", amount: ethers.parseEther("500"), token: testToken2 }
      ];

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
    });

    it("Should process complete commerce withdrawal to own wallet", async function () {
      // Get commerce balance
      const testTokenBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const initialCommerceWalletBalance = await testToken.balanceOf(roles.commerce1.address);

      // Withdraw to own wallet (withdrawAllCommerceBalance only withdraws to msg.sender)
      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
          await testToken.getAddress()
        )
      ).to.emit(storage, "CommerceWithdrawal")
        .withArgs(roles.commerce1.address, await testToken.getAddress(), testTokenBalance);

      // Verify withdrawal completed
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await testToken.balanceOf(roles.commerce1.address)).to.equal(initialCommerceWalletBalance + testTokenBalance);
    });

    it("Should process withdrawal to external treasury wallet", async function () {
      // Get commerce balance
      const testTokenBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const initialExternalWalletBalance = await testToken.balanceOf(roles.treasury1.address);

      // Withdraw to external wallet
      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken.getAddress(),
        testTokenBalance,
        roles.treasury1.address
      );

      // Verify withdrawal to external wallet
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await testToken.balanceOf(roles.treasury1.address)).to.equal(initialExternalWalletBalance + testTokenBalance);
    });

    it("Should handle partial withdrawals strategically", async function () {
      const testTokenBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const partialAmount = testTokenBalance / BigInt(3); // Withdraw 1/3

      // First partial withdrawal
      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken.getAddress(),
        partialAmount,
        roles.commerce1.address
      );

      // Verify partial withdrawal
      const remainingBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      expect(remainingBalance).to.equal(testTokenBalance - partialAmount);

      // Second partial withdrawal
      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken.getAddress(),
        partialAmount,
        roles.commerce1.address
      );

      // Verify cumulative withdrawals
      const finalBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      expect(finalBalance).to.equal(testTokenBalance - (partialAmount * BigInt(2)));
    });

    it("Should provide comprehensive withdrawal analytics", async function () {
      // Perform multiple withdrawals
      const testTokenBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const testToken2Balance = await storage.balances(roles.commerce1.address, await testToken2.getAddress());

      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken.getAddress(),
        testTokenBalance,
        roles.commerce1.address
      );

      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken2.getAddress(),
        testToken2Balance,
        roles.commerce1.address
      );

      // Verify analytics
      const commerceStats = await withdrawalManager.getCommerceWithdrawalStats(
        roles.commerce1.address
      );
      expect(commerceStats.totalWithdrawals).to.equal(2);
      expect(commerceStats.tokens.length).to.equal(2);

      // Check recent withdrawals
      const recentWithdrawals = await withdrawalManager.getRecentCommerceWithdrawals(
        roles.commerce1.address,
        5
      );
      expect(recentWithdrawals.length).to.equal(2);

      // Verify multi-token balances
      const tokens = await withdrawalManager.getAllCommerceTokens(roles.commerce1.address);
      expect(tokens.length).to.equal(2);
      expect(tokens).to.include(await testToken.getAddress());
      expect(tokens).to.include(await testToken2.getAddress());
    });
  });

  describe("❌ Failed Treasury Operations", function () {
    it("Should prevent unauthorized treasury management", async function () {
      // Unauthorized treasury wallet addition
      await expect(
        treasuryManager.connect(roles.unauthorized).addTreasuryWallet(roles.treasury1.address, "Unauthorized")
      ).to.be.revertedWith("Not treasury manager");

      // Unauthorized service fee withdrawal
      await expect(
        treasuryManager.connect(roles.unauthorized).withdrawAllServiceFeesToTreasury(roles.treasury1.address)
      ).to.be.revertedWith("Not treasury manager");
    });

    it("Should prevent operations with invalid treasury configuration", async function () {
      // Cannot add zero address as treasury
      await expect(
        treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(ethers.ZeroAddress, "Invalid")
      ).to.be.revertedWith("Invalid wallet address");

      // Set up valid treasury then deactivate
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Test Treasury");
      await treasuryManager.connect(roles.treasuryManager).setTreasuryWalletStatus(roles.treasury1.address, false);

      // Generate service fees
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invalid-treasury-test"));
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

      // Cannot withdraw to inactive treasury
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      await expect(
        treasuryManager.connect(roles.treasuryManager).withdrawServiceFeesToTreasury(
          await testToken.getAddress(),
          roles.treasury1.address
        )
      ).to.be.revertedWith("Treasury wallet not active");
    });

    it("Should prevent excessive service fee withdrawals", async function () {
      // Set up treasury
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Test Treasury");

      // Generate minimal service fees
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("excessive-withdrawal-test"));
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

      // Attempt to withdraw more than available
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      const excessiveAmount = serviceFeeBalance + ethers.parseEther("1");

      await expect(
        treasuryManager.connect(roles.treasuryManager).withdrawServiceFeesToTreasury(
          await testToken.getAddress(),
          roles.treasury1.address
        )
      ).to.be.revertedWith("Insufficient service fee balance");
    });
  });

  describe("❌ Failed Commerce Withdrawal Operations", function () {
    it("Should prevent unauthorized commerce withdrawals", async function () {
      // Generate commerce balance
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("unauthorized-withdrawal-test"));
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

      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());

      // Unauthorized user cannot withdraw commerce balance
      await expect(
        withdrawalManager.connect(roles.unauthorized).withdrawCommerceBalance(
          await testToken.getAddress(),
          commerceBalance,
          roles.unauthorized.address
        )
      ).to.be.revertedWith("Only commerce can withdraw");
    });

    it("Should prevent excessive commerce withdrawals", async function () {
      // Generate small commerce balance
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("excessive-commerce-withdrawal"));
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

      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const excessiveAmount = commerceBalance + ethers.parseEther("1");

      // Cannot withdraw more than available balance
      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
          await testToken.getAddress(),
          excessiveAmount,
          roles.commerce1.address
        )
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should prevent invalid withdrawal parameters", async function () {
      // Cannot withdraw zero amount
      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
          await testToken.getAddress(),
          0,
          roles.commerce1.address
        )
      ).to.be.revertedWith("Amount must be greater than 0");

      // Cannot withdraw with no balance
      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
          await testToken.getAddress(),
          ethers.parseEther("1"),
          roles.commerce1.address
        )
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("🔧 System Administration Flow", function () {
    it("Should handle system maintenance through pause functionality", async function () {
      // Set up treasury
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Maintenance Test");

      // Pause systems for maintenance
      await treasuryManager.pause();
      await withdrawalManager.pause();

      expect(await treasuryManager.paused()).to.be.true;
      expect(await withdrawalManager.paused()).to.be.true;

      // Operations should fail during maintenance
      await expect(
        treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury2.address, "Maintenance Test 2")
      ).to.be.revertedWithCustomError(treasuryManager, "EnforcedPause");

      // Resume operations
      await treasuryManager.unpause();
      await withdrawalManager.unpause();

      expect(await treasuryManager.paused()).to.be.false;
      expect(await withdrawalManager.paused()).to.be.false;

      // Operations should work after maintenance
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury2.address, "Post Maintenance");
      expect(await treasuryManager.isTreasuryWalletActive(roles.treasury2.address)).to.be.true;
    });

    it("Should prevent unauthorized system administration", async function () {
      // Unauthorized pause attempts
      await expect(
        treasuryManager.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");

      await expect(
        withdrawalManager.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");

      // Pause systems as owner
      await treasuryManager.pause();
      await withdrawalManager.pause();

      // Unauthorized unpause attempts
      await expect(
        treasuryManager.connect(roles.unauthorized).unpause()
      ).to.be.revertedWith("Not owner");

      await expect(
        withdrawalManager.connect(roles.unauthorized).unpause()
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("🔄 Complete Business Integration Flow", function () {
    it("Should execute full payment-to-withdrawal business cycle", async function () {
      // 1. Set up treasury infrastructure
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Integration Treasury");

      // 2. Process multiple business transactions
      const businessTransactions = [
        { id: "integration-001", amount: ethers.parseEther("2000"), commerce: roles.commerce1, token: testToken },
        { id: "integration-002", amount: ethers.parseEther("1500"), commerce: roles.commerce2, token: testToken },
        { id: "integration-003", amount: ethers.parseEther("1000"), commerce: roles.commerce1, token: testToken2 }
      ];

      for (const tx of businessTransactions) {
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

      // 3. Commerce withdrawals
      const commerce1TestTokenBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const commerce1TestToken2Balance = await storage.balances(roles.commerce1.address, await testToken2.getAddress());
      const commerce2TestTokenBalance = await storage.balances(roles.commerce2.address, await testToken.getAddress());

      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken.getAddress(),
        commerce1TestTokenBalance,
        roles.commerce1.address
      );

      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken2.getAddress(),
        commerce1TestToken2Balance,
        roles.commerce1.address
      );

      await withdrawalManager.connect(roles.commerce2).withdrawCommerceBalance(
        await testToken.getAddress(),
        commerce2TestTokenBalance,
        roles.commerce2.address
      );

      // 4. Treasury service fee collection
      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // 5. Verify complete cycle completion
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.balances(roles.commerce1.address, await testToken2.getAddress())).to.equal(0);
      expect(await storage.balances(roles.commerce2.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken2.getAddress())).to.equal(0);

      // 6. Verify treasury received service fees
      expect(await testToken.balanceOf(roles.treasury1.address)).to.be.gt(0);
      expect(await testToken2.balanceOf(roles.treasury1.address)).to.be.gt(0);

      // 7. Verify commerce received their net revenue
      expect(await testToken.balanceOf(roles.commerce1.address)).to.be.gt(0);
      expect(await testToken2.balanceOf(roles.commerce1.address)).to.be.gt(0);
      expect(await testToken.balanceOf(roles.commerce2.address)).to.be.gt(0);
    });

    it("Should provide comprehensive analytics across complete business cycle", async function () {
      // Generate business activity
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("analytics-integration"));
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

      // Perform withdrawals
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce1).withdrawCommerceBalance(
        await testToken.getAddress(),
        commerceBalance,
        roles.commerce1.address
      );

      // Set up and use treasury
      await treasuryManager.connect(roles.treasuryManager).addTreasuryWallet(roles.treasury1.address, "Analytics Treasury");
      await treasuryManager.connect(roles.treasuryManager).withdrawAllServiceFeesToTreasury(roles.treasury1.address);

      // Verify comprehensive analytics
      const withdrawalStats = await withdrawalManager.getCommerceWithdrawalStats(
        roles.commerce1.address,
        await testToken.getAddress()
      );
      expect(withdrawalStats.totalCount).to.equal(1);
      expect(withdrawalStats.totalAmount).to.equal(commerceBalance);

      const recentWithdrawals = await withdrawalManager.getRecentCommerceWithdrawals(roles.commerce1.address, 5);
      expect(recentWithdrawals.length).to.equal(1);
      expect(recentWithdrawals[0].commerce).to.equal(roles.commerce1.address);
      expect(recentWithdrawals[0].token).to.equal(await testToken.getAddress());

      const serviceStats = await treasuryManager.getServiceFeeWithdrawalStats();
      expect(serviceStats.totalWithdrawals).to.be.gt(0);
    });
  });
});