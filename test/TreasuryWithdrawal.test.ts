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

describe("Treasury & Withdrawal Management", function () {
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

    // Grant roles and setup whitelists using standardized functions
    await grantRoles(accessManager, roles);
    await setupWhitelists(accessManager, roles, [await testToken.getAddress(), await testToken2.getAddress()]);

    // Mint and approve tokens
    await testToken.mint(roles.payer1.address, ethers.parseEther("1000"));
    await testToken2.mint(roles.payer1.address, ethers.parseEther("1000"));
    await testToken.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));
    await testToken2.connect(roles.payer1).approve(await paymentProcessor.getAddress(), ethers.parseEther("1000"));

    // Mint tokens to withdrawal manager for withdrawals
    await testToken.mint(await withdrawalManager.getAddress(), ethers.parseEther("1000"));
    await testToken2.mint(await withdrawalManager.getAddress(), ethers.parseEther("1000"));
  });

  describe("Treasury Wallet Management", function () {
    it("Should add treasury wallet successfully", async function () {
      const description = "Main Treasury Wallet";

      await expect(
        treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, description)
      ).to.emit(treasuryManager, "TreasuryWalletAdded")
        .withArgs(roles.treasury1.address, description);

      const treasuryWallet = await storage.treasuryWallets(roles.treasury1.address);
      expect(treasuryWallet.wallet).to.equal(roles.treasury1.address);
      expect(treasuryWallet.isActive).to.be.true;
      expect(treasuryWallet.description).to.equal(description);
    });

    it("Should remove treasury wallet", async function () {
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Test Wallet");

      await expect(
        treasuryManager.connect(roles.owner).removeTreasuryWallet(roles.treasury1.address)
      ).to.emit(storage, "TreasuryWalletRemoved")
        .withArgs(roles.treasury1.address);
    });

    it("Should set treasury wallet status", async function () {
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Test Wallet");

      await treasuryManager.connect(roles.owner).setTreasuryWalletStatus(roles.treasury1.address, false);

      const treasuryWallet = await storage.treasuryWallets(roles.treasury1.address);
      expect(treasuryWallet.isActive).to.be.false;
    });

    it("Should get active treasury wallets", async function () {
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Active Wallet");
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.unauthorized.address, "Inactive Wallet");
      await treasuryManager.connect(roles.owner).setTreasuryWalletStatus(roles.unauthorized.address, false);

      const activeWallets = await treasuryManager.getActiveTreasuryWallets();
      expect(activeWallets).to.include(roles.treasury1.address);
      expect(activeWallets).to.not.include(roles.unauthorized.address);
    });

    it("Should prevent unauthorized treasury wallet operations", async function () {
      await expect(
        treasuryManager.connect(roles.unauthorized).addTreasuryWallet(roles.treasury1.address, "Unauthorized")
      ).to.be.revertedWith("Not treasury manager");
    });

    it("Should prevent adding zero address as treasury wallet", async function () {
      await expect(
        treasuryManager.connect(roles.owner).addTreasuryWallet(ethers.ZeroAddress, "Zero Address")
      ).to.be.revertedWith("Invalid wallet address");
    });

    it("Should check if treasury wallet is active", async function () {
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Test Wallet");
      
      expect(await treasuryManager.isTreasuryWalletActive(roles.treasury1.address)).to.be.true;
      
      await treasuryManager.connect(roles.owner).setTreasuryWalletStatus(roles.treasury1.address, false);
      expect(await treasuryManager.isTreasuryWalletActive(roles.treasury1.address)).to.be.false;
    });
  });

  describe("Service Fee Withdrawals", function () {
    beforeEach(async function () {
      // Set up treasury wallet
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Main Treasury");

      // Create and pay invoice to generate service fees
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("fee-invoice"));
      const paymentAmount = ethers.parseEther("100");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
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

    it("Should withdraw service fees successfully", async function () {
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      const initialTreasuryBalance = await testToken.balanceOf(roles.treasury1.address);

      await expect(
        treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
          await testToken.getAddress(),
          serviceFeeBalance,
          roles.treasury1.address
        )
      ).to.emit(storage, "ServiceFeeWithdrawal")
        .withArgs(await testToken.getAddress(), serviceFeeBalance, roles.treasury1.address, roles.treasuryManager.address);

      // Check service fee balance is cleared
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);

      // Check treasury received tokens
      const finalTreasuryBalance = await testToken.balanceOf(roles.treasury1.address);
      expect(finalTreasuryBalance).to.equal(initialTreasuryBalance + serviceFeeBalance);
    });

    it("Should prevent withdrawal to inactive treasury wallet", async function () {
      await treasuryManager.connect(roles.owner).setTreasuryWalletStatus(roles.treasury1.address, false);

      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());

      await expect(
        treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
          await testToken.getAddress(),
          serviceFeeBalance,
          roles.treasury1.address
        )
      ).to.be.revertedWith("Treasury wallet not active");
    });

    it("Should prevent excessive service fee withdrawal", async function () {
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      const excessiveAmount = serviceFeeBalance + ethers.parseEther("1");

      await expect(
        treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
          await testToken.getAddress(),
          excessiveAmount,
          roles.treasury1.address
        )
      ).to.be.revertedWith("Insufficient service fee balance");
    });

    it("Should prevent unauthorized service fee withdrawal", async function () {
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());

      await expect(
        treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
          await testToken.getAddress(),
          serviceFeeBalance,
          roles.treasury1.address
        )
      ).to.be.revertedWith("Not treasury manager");
    });
  });

  describe("Commerce Withdrawals", function () {
    beforeEach(async function () {
      // Create and pay invoice to generate commerce balance
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("commerce-invoice"));
      const paymentAmount = ethers.parseEther("100");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
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

    it("Should withdraw commerce balance successfully", async function () {
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const initialCommerceTokenBalance = await testToken.balanceOf(roles.commerce1.address);

      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
          await testToken.getAddress(),
          commerceBalance,
          roles.commerce1.address
        )
      ).to.emit(storage, "CommerceWithdrawal")
        .withArgs(roles.commerce1.address, await testToken.getAddress(), commerceBalance, roles.commerce1.address);

      // Check commerce balance is cleared
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);

      // Check commerce received tokens
      const finalCommerceTokenBalance = await testToken.balanceOf(roles.commerce1.address);
      expect(finalCommerceTokenBalance).to.equal(initialCommerceTokenBalance + commerceBalance);
    });

    it("Should prevent excessive commerce withdrawal", async function () {
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

    it("Should prevent withdrawal by unauthorized user", async function () {
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());

      await expect(
        withdrawalManager.connect(roles.unauthorized).withdrawAllCommerceBalance(
          await testToken.getAddress(),
          commerceBalance,
          roles.commerce1.address
        )
      ).to.be.revertedWith("Only commerce can withdraw");
    });

    it("Should allow withdrawal to different address", async function () {
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const initialRecipientBalance = await testToken.balanceOf(roles.treasury1.address);

      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress(),
        commerceBalance,
        roles.treasury1.address
      );

      // Check tokens sent to different address
      const finalRecipientBalance = await testToken.balanceOf(roles.treasury1.address);
      expect(finalRecipientBalance).to.equal(initialRecipientBalance + commerceBalance);
    });

    it("Should handle partial withdrawals", async function () {
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const partialAmount = commerceBalance / BigInt(2);

      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress(),
        partialAmount,
        roles.commerce1.address
      );

      // Check remaining balance
      const remainingBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      expect(remainingBalance).to.equal(commerceBalance - partialAmount);
    });
  });

  describe("Withdrawal Analytics", function () {
    beforeEach(async function () {
      // Set up treasury
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Main Treasury");

      // Create multiple invoices and payments
      const invoices = [
        { id: "analytics-1", amount: ethers.parseEther("100") },
        { id: "analytics-2", amount: ethers.parseEther("200") },
        { id: "analytics-3", amount: ethers.parseEther("150") }
      ];

      for (const inv of invoices) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(inv.id));
        const paymentOptions = [
          { token: await testToken.getAddress(), amount: inv.amount }
        ];

        await invoiceManager.connect(roles.commerce1).createInvoice(
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

      // Perform some withdrawals
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      const partialAmount = commerceBalance / BigInt(2);
      
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress(),
        partialAmount,
        roles.commerce1.address
      );

      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      await treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
        await testToken.getAddress(),
        serviceFeeBalance,
        roles.treasury1.address
      );
    });

    it("Should get commerce withdrawal statistics", async function () {
      const stats = await withdrawalManager.getCommerceWithdrawalStats(
        roles.commerce1.address,
        await testToken.getAddress()
      );

      expect(stats.totalCount).to.equal(1); // One withdrawal performed
      expect(stats.totalAmount).to.be.gt(0);
    });

    it("Should get recent commerce withdrawals", async function () {
      const recentWithdrawals = await withdrawalManager.getRecentCommerceWithdrawals(
        roles.commerce1.address,
        5
      );

      expect(recentWithdrawals.length).to.equal(1);
      expect(recentWithdrawals[0].to).to.equal(roles.commerce1.address);
      expect(recentWithdrawals[0].token).to.equal(await testToken.getAddress());
    });

    it("Should get token withdrawal statistics", async function () {
      const stats = await withdrawalManager.getCommerceWithdrawalStats(roles.commerce1.address);

      expect(stats.totalCount).to.equal(2); // Commerce + service fee withdrawal
      expect(stats.totalAmount).to.be.gt(0);
    });

    it("Should get recent treasury withdrawals", async function () {
      const recentWithdrawals = await treasuryManager.getRecentTreasuryWithdrawals(
        roles.treasury1.address,
        5
      );

      expect(recentWithdrawals.length).to.equal(1);
      expect(recentWithdrawals[0].to).to.equal(roles.treasury1.address);
    });

    it("Should get service fee withdrawal statistics", async function () {
      const stats = await treasuryManager.getServiceFeeWithdrawalStats();

      expect(stats.totalWithdrawals).to.equal(1);
      // Other fields might be simplified in implementation
    });
  });

  describe("Balance Queries", function () {
    beforeEach(async function () {
      // Create payments with multiple tokens
      const invoices = [
        { id: "balance-1", amount: ethers.parseEther("100"), token: testToken },
        { id: "balance-2", amount: ethers.parseEther("200"), token: testToken2 }
      ];

      for (const inv of invoices) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(inv.id));
        const paymentOptions = [
          { token: await inv.token.getAddress(), amount: inv.amount }
        ];

        await invoiceManager.connect(roles.commerce1).createInvoice(
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
    });

    it("Should get commerce balance for specific token", async function () {
      const balance = await withdrawalManager.getCommerceBalance(
        roles.commerce1.address,
        await testToken.getAddress()
      );

      expect(balance).to.be.gt(0);
    });

    it("Should get commerce balances for multiple tokens", async function () {
      const tokens = [await testToken.getAddress(), await testToken2.getAddress()];
      const balances = await withdrawalManager.getCommerceBalances(roles.commerce1.address, tokens);

      expect(balances.length).to.equal(2);
      expect(balances[0]).to.be.gt(0);
      expect(balances[1]).to.be.gt(0);
    });

    it("Should get all commerce tokens", async function () {
      const tokens = await withdrawalManager.getAllCommerceTokens(roles.commerce1.address);

      expect(tokens.length).to.equal(2);
      expect(tokens).to.include(await testToken.getAddress());
      expect(tokens).to.include(await testToken2.getAddress());
    });
  });

  describe("Pause Functionality", function () {
    beforeEach(async function () {
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Test Treasury");
    });

    it("Should pause and unpause treasury manager", async function () {
      await treasuryManager.pause();
      expect(await treasuryManager.paused()).to.be.true;

      await treasuryManager.unpause();
      expect(await treasuryManager.paused()).to.be.false;
    });

    it("Should pause and unpause withdrawal manager", async function () {
      await withdrawalManager.pause();
      expect(await withdrawalManager.paused()).to.be.true;

      await withdrawalManager.unpause();
      expect(await withdrawalManager.paused()).to.be.false;
    });

    it("Should prevent operations when paused", async function () {
      await treasuryManager.pause();

      await expect(
        treasuryManager.connect(roles.owner).addTreasuryWallet(roles.unauthorized.address, "Paused Test")
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should prevent unauthorized pause/unpause", async function () {
      await expect(
        treasuryManager.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");

      await expect(
        withdrawalManager.connect(roles.unauthorized).pause()
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero amount withdrawals", async function () {
      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
          await testToken.getAddress(),
          0,
          roles.commerce1.address
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should handle withdrawal with no balance", async function () {
      await expect(
        withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
          await testToken.getAddress(),
          ethers.parseEther("1"),
          roles.commerce1.address
        )
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should handle treasury operations with non-existent wallet", async function () {
      expect(await treasuryManager.isTreasuryWalletActive(roles.unauthorized.address)).to.be.false;
    });

    it("Should handle analytics for commerce with no withdrawals", async function () {
      const stats = await withdrawalManager.getCommerceWithdrawalStats(
        roles.unauthorized.address,
        await testToken.getAddress()
      );

      expect(stats.totalCount).to.equal(0);
      expect(stats.totalAmount).to.equal(0);
    });

    it("Should handle empty withdrawal history", async function () {
      const recentWithdrawals = await withdrawalManager.getRecentCommerceWithdrawals(
        roles.unauthorized.address,
        5
      );

      expect(recentWithdrawals.length).to.equal(0);
    });
  });

  describe("Integration Tests", function () {
    it("Should complete full treasury cycle", async function () {
      // 1. Add treasury wallet
      await treasuryManager.connect(roles.owner).addTreasuryWallet(roles.treasury1.address, "Integration Test");

      // 2. Generate service fees through payments
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("integration-invoice"));
      const paymentAmount = ethers.parseEther("100");
      const paymentOptions = [
        { token: await testToken.getAddress(), amount: paymentAmount }
      ];

      await invoiceManager.connect(roles.commerce1).createInvoice(
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

      // 3. Withdraw commerce balance
      const commerceBalance = await storage.balances(roles.commerce1.address, await testToken.getAddress());
      await withdrawalManager.connect(roles.commerce1).withdrawAllCommerceBalance(
        await testToken.getAddress(),
        commerceBalance,
        roles.commerce1.address
      );

      // 4. Withdraw service fees
      const serviceFeeBalance = await storage.serviceFeeBalances(await testToken.getAddress());
      await treasuryManager.connect(roles.owner).withdrawServiceFeesToTreasury(
        await testToken.getAddress(),
        serviceFeeBalance,
        roles.treasury1.address
      );

      // 5. Verify final state
      expect(await storage.balances(roles.commerce1.address, await testToken.getAddress())).to.equal(0);
      expect(await storage.serviceFeeBalances(await testToken.getAddress())).to.equal(0);
    });
  });
});