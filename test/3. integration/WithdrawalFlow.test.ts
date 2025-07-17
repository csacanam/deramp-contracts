import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setupTest, TestContext } from '../1. setup/test-setup';

describe('Withdrawal Flow Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTest();
  });

  describe('Commerce Withdrawal Management', () => {
    it('should process complete withdrawal flow', async () => {
      const { 
        proxy, 
        storage, 
        withdrawalManager, 
        mockToken1, 
        mockToken2,
        commerce1, 
        user1, 
        user2,
        treasury 
      } = context;

      // 1. Generate balances through payments
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("withdrawal-flow-invoice-1"));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("withdrawal-flow-invoice-2"));

      // Whitelist commerce and tokens
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken2.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken2.getAddress()]);
      await proxy.createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await proxy.createInvoice(
        invoiceId2,
        await commerce1.getAddress(),
        [{
          token: await mockToken2.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      // Pay invoices
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), paymentAmount);

      await mockToken2.mint(await user2.getAddress(), paymentAmount);
      await mockToken2.connect(user2).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user2).payInvoice(invoiceId2, await mockToken2.getAddress(), paymentAmount);

      // 2. Verify balances were created
      const balance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress());
      expect(balance1).to.be.greaterThan(0);
      expect(balance2).to.be.greaterThan(0);

      // 3. Process withdrawals
      await proxy.connect(commerce1).withdrawAll([await mockToken1.getAddress(), await mockToken2.getAddress()]);

      // 4. Verify balances were withdrawn
      expect(await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(0);
      expect(await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress())).to.equal(0);

      // 5. Verify commerce received the funds
      const commerceBalance1 = await mockToken1.balanceOf(await commerce1.getAddress());
      const commerceBalance2 = await mockToken2.balanceOf(await commerce1.getAddress());
      expect(commerceBalance1).to.equal(balance1);
      expect(commerceBalance2).to.equal(balance2);
    });

    it('should handle single token withdrawals', async () => {
      const { 
        proxy, 
        storage, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("single-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      const initialBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(initialBalance).to.be.greaterThan(0);

      // Withdraw single token
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());

      // Verify withdrawal
      expect(await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(0);
      expect(await mockToken1.balanceOf(await commerce1.getAddress())).to.equal(initialBalance);
    });

    it('should handle specific amount withdrawals', async () => {
      const { 
        proxy, 
        storage, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("specific-amount-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      const totalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const withdrawalAmount = totalBalance / 2n; // Withdraw half

      // Withdraw specific amount
      await proxy.connect(commerce1).withdrawTo(
        await mockToken1.getAddress(),
        withdrawalAmount,
        await commerce1.getAddress()
      );

      // Verify partial withdrawal
      expect(await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(totalBalance - withdrawalAmount);
      expect(await mockToken1.balanceOf(await commerce1.getAddress())).to.equal(withdrawalAmount);
    });

    it('should handle withdrawals to different addresses', async () => {
      const { 
        proxy, 
        storage, 
        mockToken1, 
        commerce1, 
        user1, 
        user2 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("different-address-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      const totalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());

      // Withdraw to different address
      await proxy.connect(commerce1).withdrawTo(
        await mockToken1.getAddress(),
        totalBalance,
        await user2.getAddress()
      );

      // Verify withdrawal to different address
      expect(await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(0);
      expect(await mockToken1.balanceOf(await user2.getAddress())).to.equal(totalBalance);
    });
  });

  describe('Withdrawal Tracking and Analytics', () => {
    it('should track withdrawal statistics correctly', async () => {
      const { 
        proxy, 
        storage, 
        withdrawalManager, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("analytics-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());

      // Get initial withdrawal count
      const initialWithdrawalCount = await withdrawalManager.getWithdrawalCount();
      const initialCommerceWithdrawals = await withdrawalManager.getCommerceWithdrawalIndices(await commerce1.getAddress());

      // Process withdrawal
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());

      // Verify withdrawal tracking
      const finalWithdrawalCount = await withdrawalManager.getWithdrawalCount();
      const finalCommerceWithdrawals = await withdrawalManager.getCommerceWithdrawalIndices(await commerce1.getAddress());

      expect(finalWithdrawalCount).to.equal(initialWithdrawalCount + 1n);
      expect(finalCommerceWithdrawals.length).to.equal(initialCommerceWithdrawals.length + 1);
    });

    it('should provide comprehensive withdrawal information', async () => {
      const { 
        proxy, 
        storage, 
        withdrawalManager, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("comprehensive-withdrawal-info"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Process withdrawal
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());

      // Get withdrawal information
      const withdrawalCount = await withdrawalManager.getWithdrawalCount();
      const commerceWithdrawals = await withdrawalManager.getCommerceWithdrawalIndices(await commerce1.getAddress());
      const recentWithdrawals = await withdrawalManager.getRecentWithdrawals(5);
      const withdrawalHistory = await withdrawalManager.getWithdrawalHistory();

      expect(withdrawalCount).to.be.greaterThan(0);
      expect(commerceWithdrawals.length).to.be.greaterThan(0);
      expect(recentWithdrawals.length).to.be.greaterThan(0);
      expect(withdrawalHistory.length).to.be.greaterThan(0);
    });

    it('should handle withdrawal queries by type and token', async () => {
      const { 
        proxy, 
        storage, 
        withdrawalManager, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("query-withdrawal-token"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());

      // Query withdrawals by token
      const token1Withdrawals = await withdrawalManager.getWithdrawalsByToken(await mockToken1.getAddress());
      expect(token1Withdrawals.length).to.be.greaterThan(0);

      // Query withdrawals by type
      const commerceWithdrawals = await withdrawalManager.getWithdrawalsByType(0); // COMMERCE_WITHDRAWAL
      expect(commerceWithdrawals.length).to.be.greaterThan(0);
    });
  });

  describe('Withdrawal Flow Security and Validation', () => {
    it('should reject withdrawals with insufficient balance', async () => {
      const { 
        proxy, 
        storage, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("insufficient-balance-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const excessiveAmount = balance + ethers.parseUnits("1", 6);

      // Try to withdraw more than available
      await expect(
        proxy.connect(commerce1).withdrawTo(
          await mockToken1.getAddress(),
          excessiveAmount,
          await commerce1.getAddress()
        )
      ).to.be.revertedWith("Insufficient balance [PX]");
    });

    it('should reject withdrawals with zero amount', async () => {
      const { proxy, mockToken1, commerce1 } = context;

      await expect(
        proxy.connect(commerce1).withdrawTo(
          await mockToken1.getAddress(),
          0,
          await commerce1.getAddress()
        )
      ).to.be.revertedWith("Amount must be greater than 0 [PX]");
    });

    it('should reject withdrawals to zero address', async () => {
      const { 
        proxy, 
        storage, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("zero-address-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());

      // Try to withdraw to zero address
      await expect(
        proxy.connect(commerce1).withdrawTo(
          await mockToken1.getAddress(),
          balance,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Invalid recipient [PX]");
    });

    it('should reject withdrawals with empty tokens array', async () => {
      const { proxy, commerce1 } = context;

      await expect(
        proxy.connect(commerce1).withdrawAll([])
      ).to.be.revertedWith("No tokens provided [PX]");
    });

    it('should reject withdrawals from non-whitelisted commerce', async () => {
      const { 
        proxy, 
        mockToken1, 
        user2 
      } = context;

      // Try to withdraw from non-whitelisted commerce (no invoice or balance needed)
      await expect(
        proxy.connect(user2).withdraw(await mockToken1.getAddress())
      ).to.be.revertedWith("Commerce not whitelisted [PX]");
    });
  });

  describe('Withdrawal Flow Integration with Other Modules', () => {
    it('should integrate with payment processing for balance generation', async () => {
      const { 
        proxy, 
        storage, 
        paymentProcessor, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      const paymentAmount = ethers.parseUnits("100", 6);
      const defaultFeePercent = await context.accessManager.getDefaultFeePercent();
      const expectedFee = (paymentAmount * defaultFeePercent) / 10000n;
      const expectedCommerceAmount = paymentAmount - expectedFee;

      // Process payment through PaymentProcessor
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("payment-integration-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Verify PaymentProcessor and Storage are in sync
      const paymentProcessorBalance = await paymentProcessor.getBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const storageBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      
      expect(paymentProcessorBalance).to.equal(expectedCommerceAmount);
      expect(storageBalance).to.equal(expectedCommerceAmount);
    });

    it('should integrate with access control for withdrawal permissions', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1, 
        user2 
      } = context;

      // Add user2 to whitelist and create balance
      await accessManager.connect(context.admin).addCommerceToWhitelist(await user2.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await user2.getAddress(), [await mockToken1.getAddress()]);

      // Create balance for user2
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("access-control-withdrawal-invoice"));
      await proxy.createInvoice(
        invoiceId,
        await user2.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user2.getAddress(), paymentAmount);
      await mockToken1.connect(user2).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user2).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // User2 should be able to withdraw (whitelisted commerce)
      await expect(
        proxy.connect(user2).withdraw(await mockToken1.getAddress())
      ).to.not.be.reverted;

      // Remove user2 from whitelist and test failure
      await accessManager.connect(context.admin).removeCommerceFromWhitelist(await user2.getAddress());
      
      // Try to withdraw again (should fail due to not being whitelisted)
      await expect(
        proxy.connect(user2).withdraw(await mockToken1.getAddress())
      ).to.be.revertedWith("Commerce not whitelisted [PX]");
    });

    it('should handle withdrawal operations during system pause', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("pause-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Pause system
      await proxy.connect(context.admin).pause();

      // Withdrawal operations should be blocked during pause
      await expect(
        proxy.connect(commerce1).withdraw(await mockToken1.getAddress())
      ).to.be.reverted;
    });
  });

  describe('Withdrawal Flow Edge Cases', () => {
    it('should handle multiple withdrawals from same commerce', async () => {
      const { 
        proxy, 
        storage, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Generate balance through payment
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("multiple-withdrawals-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      const totalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const firstWithdrawal = totalBalance / 3n;
      const secondWithdrawal = totalBalance / 3n;

      // First partial withdrawal
      await proxy.connect(commerce1).withdrawTo(
        await mockToken1.getAddress(),
        firstWithdrawal,
        await commerce1.getAddress()
      );

      // Second partial withdrawal
      await proxy.connect(commerce1).withdrawTo(
        await mockToken1.getAddress(),
        secondWithdrawal,
        await commerce1.getAddress()
      );

      // Verify remaining balance
      const remainingBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(remainingBalance).to.equal(totalBalance - firstWithdrawal - secondWithdrawal);
    });

    it('should handle withdrawal with only one token having balance', async () => {
      const { 
        proxy, 
        storage, 
        mockToken1, 
        mockToken2, 
        commerce1, 
        user1 
      } = context;

      // Generate balance only for token1
      const paymentAmount = ethers.parseUnits("100", 6);
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("single-token-balance-withdrawal-invoice"));
      
      // Whitelist commerce and token
      await context.accessManager.connect(context.admin).addCommerceToWhitelist(await commerce1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToWhitelist(await mockToken1.getAddress());
      await context.accessManager.connect(context.admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Try to withdraw both tokens (only token1 has balance)
      await proxy.connect(commerce1).withdrawAll([await mockToken1.getAddress(), await mockToken2.getAddress()]);

      // Verify only token1 was withdrawn
      expect(await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(0);
      expect(await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress())).to.equal(0);
    });

    it('should handle withdrawal statistics for commerce with no withdrawals', async () => {
      const { 
        withdrawalManager, 
        user1 
      } = context;

      // Get withdrawal statistics for commerce with no withdrawals
      const withdrawalCount = await withdrawalManager.getWithdrawalCount();
      const commerceWithdrawals = await withdrawalManager.getCommerceWithdrawalIndices(await user1.getAddress());
      const recentWithdrawals = await withdrawalManager.getRecentWithdrawals(5);

      expect(withdrawalCount).to.be.greaterThanOrEqual(0);
      expect(commerceWithdrawals.length).to.equal(0);
      expect(recentWithdrawals.length).to.be.greaterThanOrEqual(0);
    });
  });
}); 