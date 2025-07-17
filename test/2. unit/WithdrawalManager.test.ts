import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setupTest, TestContext } from '../1. setup/test-setup';

describe('WithdrawalManager', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTest();
  });

  describe('Commerce Withdrawals', () => {
    beforeEach(async () => {
      // Setup commerce with funds for withdrawal tests
      const { proxy, admin, backend, commerce1, user1, mockToken1, mockToken2 } = context;
      
      // Add commerce to whitelist
      await context.accessManager.connect(context.onboarding).addCommerceToWhitelist(
        await commerce1.getAddress()
      );
      
      // Whitelist tokens for commerce
      await context.accessManager.connect(context.onboarding).addTokenToCommerceWhitelist(
        await commerce1.getAddress(),
        [await mockToken1.getAddress(), await mockToken2.getAddress()]
      );
      
      // Create and pay invoices to generate funds for commerce
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes('withdrawal-invoice-1'));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes('withdrawal-invoice-2'));
      const paymentAmount = ethers.parseUnits('100', 6);
      
      await proxy.connect(backend).createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{ token: await mockToken1.getAddress(), amount: paymentAmount }],
        0
      );
      
      await proxy.connect(backend).createInvoice(
        invoiceId2,
        await commerce1.getAddress(),
        [{ token: await mockToken2.getAddress(), amount: paymentAmount }],
        0
      );
      
      // Mint tokens and approve
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken2.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await mockToken2.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      
      // Pay invoices
      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId2, await mockToken2.getAddress(), paymentAmount);
      
      // Verify commerce has funds
      const balance1 = await context.storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await context.storage.balances(await commerce1.getAddress(), await mockToken2.getAddress());
      expect(balance1).to.be.greaterThan(0);
      expect(balance2).to.be.greaterThan(0);
    });

    it('should withdraw all balance for a single token', async () => {
      const { proxy, withdrawalManager, commerce1, mockToken1 } = context;
      const initialBalance = await mockToken1.balanceOf(await commerce1.getAddress());
      const commerceBalance = await context.storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      
      expect(commerceBalance).to.be.greaterThan(0);
      
      await expect(
        proxy.connect(commerce1).withdraw(await mockToken1.getAddress())
      ).to.not.be.reverted;
      
      const finalBalance = await mockToken1.balanceOf(await commerce1.getAddress());
      expect(finalBalance).to.equal(initialBalance + commerceBalance);
      
      // Verify balance is zero in storage
      expect(await context.storage.balances(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(0);
    });

    it('should withdraw all balances for multiple tokens', async () => {
      const { proxy, withdrawalManager, commerce1, mockToken1, mockToken2 } = context;
      const initialBalance1 = await mockToken1.balanceOf(await commerce1.getAddress());
      const initialBalance2 = await mockToken2.balanceOf(await commerce1.getAddress());
      const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
      
      await expect(
        proxy.connect(commerce1).withdrawAll(tokens)
      ).to.not.be.reverted;
      
      const finalBalance1 = await mockToken1.balanceOf(await commerce1.getAddress());
      const finalBalance2 = await mockToken2.balanceOf(await commerce1.getAddress());
      
      expect(finalBalance1).to.be.greaterThan(initialBalance1);
      expect(finalBalance2).to.be.greaterThan(initialBalance2);
      
      // Verify balances are zero in storage
      expect(await context.storage.balances(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(0);
      expect(await context.storage.balances(await commerce1.getAddress(), await mockToken2.getAddress())).to.equal(0);
    });

    it('should withdraw specific amount to specific address', async () => {
      const { proxy, withdrawalManager, commerce1, mockToken1, backend } = context;
      const recipient = await backend.getAddress();
      const withdrawAmount = ethers.parseUnits('50', 6);
      const initialRecipientBalance = await mockToken1.balanceOf(recipient);
      const initialCommerceBalance = await mockToken1.balanceOf(await commerce1.getAddress());
      
      await expect(
        proxy.connect(commerce1).withdrawTo(await mockToken1.getAddress(), withdrawAmount, recipient)
      ).to.not.be.reverted;
      
      const finalRecipientBalance = await mockToken1.balanceOf(recipient);
      const finalCommerceBalance = await mockToken1.balanceOf(await commerce1.getAddress());
      
      expect(finalRecipientBalance).to.equal(initialRecipientBalance + withdrawAmount);
      expect(finalCommerceBalance).to.equal(initialCommerceBalance); // Commerce should not receive tokens
      
      // Verify balance is reduced in storage
      const remainingBalance = await context.storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(remainingBalance).to.be.greaterThan(0);
    });

    it('should fail withdrawal when no funds available', async () => {
      const { proxy, commerce1, mockToken1 } = context;
      
      // First withdraw all funds
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      
      // Try to withdraw again
      await expect(
        proxy.connect(commerce1).withdraw(await mockToken1.getAddress())
      ).to.be.revertedWith('No funds to withdraw [PX]');
    });

    it('should fail withdrawal with empty tokens array', async () => {
      const { proxy, commerce1 } = context;
      const emptyTokens: string[] = [];
      
      await expect(
        proxy.connect(commerce1).withdrawAll(emptyTokens)
      ).to.be.revertedWith('No tokens provided [PX]');
    });

    it('should fail withdrawTo with zero amount', async () => {
      const { proxy, commerce1, mockToken1, backend } = context;
      const recipient = await backend.getAddress();
      
      await expect(
        proxy.connect(commerce1).withdrawTo(await mockToken1.getAddress(), 0, recipient)
      ).to.be.revertedWith('Amount must be greater than 0 [PX]');
    });

    it('should fail withdrawTo with zero address recipient', async () => {
      const { proxy, commerce1, mockToken1 } = context;
      const withdrawAmount = ethers.parseUnits('10', 6);
      
      await expect(
        proxy.connect(commerce1).withdrawTo(await mockToken1.getAddress(), withdrawAmount, ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid recipient [PX]');
    });

    it('should fail withdrawTo with insufficient balance', async () => {
      const { proxy, commerce1, mockToken1, backend } = context;
      const recipient = await backend.getAddress();
      const withdrawAmount = ethers.parseUnits('1000', 6); // More than available
      
      await expect(
        proxy.connect(commerce1).withdrawTo(await mockToken1.getAddress(), withdrawAmount, recipient)
      ).to.be.revertedWith('Insufficient balance [PX]');
    });

    it('should fail withdrawal when commerce is not whitelisted', async () => {
      const { proxy, mockToken1 } = context;
      const nonWhitelistedCommerce = ethers.Wallet.createRandom();
      
      // Connect the wallet to the provider
      const provider = ethers.provider;
      const connectedWallet = nonWhitelistedCommerce.connect(provider);
      
      await expect(
        proxy.connect(connectedWallet).withdraw(await mockToken1.getAddress())
      ).to.be.revertedWith('Commerce not whitelisted [PX]');
    });
  });

  describe('Withdrawal Queries', () => {
    beforeEach(async () => {
      // Setup and perform some withdrawals for query tests
      const { proxy, admin, backend, commerce1, user1, mockToken1, mockToken2 } = context;
      
      // Add commerce to whitelist
      await context.accessManager.connect(context.onboarding).addCommerceToWhitelist(
        await commerce1.getAddress()
      );
      
      // Whitelist tokens
      await context.accessManager.connect(context.onboarding).addTokenToCommerceWhitelist(
        await commerce1.getAddress(),
        [await mockToken1.getAddress(), await mockToken2.getAddress()]
      );
      
      // Create and pay invoices
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes('query-invoice-1'));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes('query-invoice-2'));
      const paymentAmount = ethers.parseUnits('50', 6);
      
      await proxy.connect(backend).createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{ token: await mockToken1.getAddress(), amount: paymentAmount }],
        0
      );
      
      await proxy.connect(backend).createInvoice(
        invoiceId2,
        await commerce1.getAddress(),
        [{ token: await mockToken2.getAddress(), amount: paymentAmount }],
        0
      );
      
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken2.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await mockToken2.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      
      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId2, await mockToken2.getAddress(), paymentAmount);
      
      // Perform withdrawals
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      await proxy.connect(commerce1).withdraw(await mockToken2.getAddress());
    });

    it('should get withdrawal count correctly', async () => {
      const { withdrawalManager } = context;
      const count = await withdrawalManager.getWithdrawalCount();
      expect(count).to.be.greaterThan(0);
    });

    it('should get specific withdrawal by index', async () => {
      const { withdrawalManager, commerce1, mockToken1 } = context;
      const withdrawal = await withdrawalManager.getWithdrawal(0);
      
      expect(withdrawal.token).to.equal(await mockToken1.getAddress());
      expect(withdrawal.to).to.equal(await commerce1.getAddress());
      expect(withdrawal.initiatedBy).to.equal(await commerce1.getAddress());
      expect(withdrawal.amount).to.be.greaterThan(0);
      expect(withdrawal.createdAt).to.be.greaterThan(0);
    });

    it('should fail getting withdrawal with invalid index', async () => {
      const { withdrawalManager } = context;
      const count = await withdrawalManager.getWithdrawalCount();
      
      await expect(
        withdrawalManager.getWithdrawal(count + 1n)
      ).to.be.revertedWith('Withdrawal index out of bounds [WM]');
    });

    it('should get multiple withdrawals by indices', async () => {
      const { withdrawalManager } = context;
      const indices = [0, 1];
      
      const withdrawals = await withdrawalManager.getMultipleWithdrawals(indices);
      expect(withdrawals.length).to.equal(2);
      expect(withdrawals[0].token).to.not.equal(ethers.ZeroAddress);
      expect(withdrawals[1].token).to.not.equal(ethers.ZeroAddress);
    });

    it('should get commerce withdrawal indices', async () => {
      const { withdrawalManager, commerce1 } = context;
      const indices = await withdrawalManager.getCommerceWithdrawalIndices(await commerce1.getAddress());
      expect(indices.length).to.be.greaterThan(0);
    });

    it('should get recent commerce withdrawals', async () => {
      const { withdrawalManager, commerce1 } = context;
      const recentWithdrawals = await withdrawalManager.getRecentCommerceWithdrawals(await commerce1.getAddress(), 5);
      expect(recentWithdrawals.length).to.be.greaterThan(0);
      expect(recentWithdrawals.length).to.be.lessThanOrEqual(5);
    });

    it('should get commerce withdrawal stats', async () => {
      const { withdrawalManager, commerce1 } = context;
      const stats = await withdrawalManager.getCommerceWithdrawalStats(await commerce1.getAddress());
      
      expect(stats.totalWithdrawals).to.be.greaterThan(0);
      expect(stats.tokens.length).to.be.greaterThan(0);
      expect(stats.totalAmountByToken.length).to.equal(stats.tokens.length);
    });

    it('should get complete withdrawal history', async () => {
      const { withdrawalManager } = context;
      const history = await withdrawalManager.getWithdrawalHistory();
      expect(history.length).to.be.greaterThan(0);
    });

    it('should get commerce withdrawals', async () => {
      const { withdrawalManager, commerce1 } = context;
      const withdrawals = await withdrawalManager.getCommerceWithdrawals(await commerce1.getAddress());
      expect(withdrawals.length).to.be.greaterThan(0);
    });

    it('should get withdrawals by type', async () => {
      const { withdrawalManager } = context;
      const commerceWithdrawals = await withdrawalManager.getWithdrawalsByType(0); // COMMERCE type
      expect(commerceWithdrawals.length).to.be.greaterThan(0);
    });

    it('should get withdrawals by token', async () => {
      const { withdrawalManager, mockToken1 } = context;
      const tokenWithdrawals = await withdrawalManager.getWithdrawalsByToken(await mockToken1.getAddress());
      expect(tokenWithdrawals.length).to.be.greaterThan(0);
    });

    it('should get recent withdrawals with limit', async () => {
      const { withdrawalManager } = context;
      const recentWithdrawals = await withdrawalManager.getRecentWithdrawals(3);
      expect(recentWithdrawals.length).to.be.lessThanOrEqual(3);
    });

    it('should get withdrawals by date range', async () => {
      const { withdrawalManager } = context;
      const block = await ethers.provider.getBlock('latest');
      const currentTime = block.timestamp;
      const fromTimestamp = currentTime - 3600; // 1 hour ago
      const toTimestamp = currentTime + 3600; // 1 hour from now
      
      const rangeWithdrawals = await withdrawalManager.getWithdrawalsByDateRange(fromTimestamp, toTimestamp);
      expect(rangeWithdrawals.length).to.be.greaterThan(0);
    });

    it('should get total withdrawals by token', async () => {
      const { withdrawalManager, mockToken1 } = context;
      const totalStats = await withdrawalManager.getTotalWithdrawalsByToken(await mockToken1.getAddress());
      
      expect(totalStats.totalAmount).to.be.greaterThan(0);
      expect(totalStats.totalCount).to.be.greaterThan(0);
    });
  });

  describe('Balance Queries', () => {
    beforeEach(async () => {
      // Setup commerce with funds
      const { proxy, admin, backend, commerce1, user1, mockToken1, mockToken2 } = context;
      
      await context.accessManager.connect(context.onboarding).addCommerceToWhitelist(
        await commerce1.getAddress()
      );
      
      await context.accessManager.connect(context.onboarding).addTokenToCommerceWhitelist(
        await commerce1.getAddress(),
        [await mockToken1.getAddress(), await mockToken2.getAddress()]
      );
      
      // Create and pay invoices
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes('balance-invoice-1'));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes('balance-invoice-2'));
      const paymentAmount = ethers.parseUnits('75', 6);
      
      await proxy.connect(backend).createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{ token: await mockToken1.getAddress(), amount: paymentAmount }],
        0
      );
      
      await proxy.connect(backend).createInvoice(
        invoiceId2,
        await commerce1.getAddress(),
        [{ token: await mockToken2.getAddress(), amount: paymentAmount }],
        0
      );
      
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken2.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await mockToken2.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      
      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId2, await mockToken2.getAddress(), paymentAmount);
    });

    it('should get commerce balance for single token', async () => {
      const { withdrawalManager, commerce1, mockToken1 } = context;
      const balance = await withdrawalManager.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.be.greaterThan(0);
    });

    it('should get commerce balances for multiple tokens', async () => {
      const { withdrawalManager, commerce1, mockToken1, mockToken2 } = context;
      const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
      const balances = await withdrawalManager.getCommerceBalances(await commerce1.getAddress(), tokens);
      
      expect(balances.length).to.equal(2);
      expect(balances[0]).to.be.greaterThan(0);
      expect(balances[1]).to.be.greaterThan(0);
    });

    it('should return zero balance for non-existent commerce', async () => {
      const { withdrawalManager, mockToken1 } = context;
      const nonExistentCommerce = ethers.Wallet.createRandom().address;
      const balance = await withdrawalManager.getCommerceBalance(nonExistentCommerce, await mockToken1.getAddress());
      expect(balance).to.equal(0);
    });
  });

  describe('Access Control', () => {
    it('should only allow proxy to call withdrawal functions', async () => {
      const { withdrawalManager, commerce1, mockToken1 } = context;
      
      // Direct calls to WithdrawalManager should fail
      await expect(
        withdrawalManager.connect(commerce1).withdraw(await commerce1.getAddress(), await mockToken1.getAddress())
      ).to.be.revertedWith('Only proxy can call');
      
      await expect(
        withdrawalManager.connect(commerce1).withdrawAll(await commerce1.getAddress(), [await mockToken1.getAddress()])
      ).to.be.revertedWith('Only proxy can call');
    });

    it('should allow proxy to call withdrawal functions', async () => {
      const { proxy, commerce1, mockToken1 } = context;
      
      // Calls through proxy should succeed (but may fail for other reasons like insufficient funds)
      // This test just verifies the proxy can call the function
      await expect(
        proxy.connect(commerce1).withdraw(await mockToken1.getAddress())
      ).to.be.revertedWith('No funds to withdraw [PX]'); // Expected failure, but not "Only proxy can call"
    });
  });

  describe('Edge Cases', () => {
    it('should handle withdrawal with only one token having balance', async () => {
      const { proxy, commerce1, mockToken1, mockToken2 } = context;
      
      // Setup commerce
      await context.accessManager.connect(context.onboarding).addCommerceToWhitelist(
        await commerce1.getAddress()
      );
      
      await context.accessManager.connect(context.onboarding).addTokenToCommerceWhitelist(
        await commerce1.getAddress(),
        [await mockToken1.getAddress(), await mockToken2.getAddress()]
      );
      
      // Only add funds for one token
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('single-token-invoice'));
      const paymentAmount = ethers.parseUnits('25', 6);
      
      await proxy.connect(context.backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{ token: await mockToken1.getAddress(), amount: paymentAmount }],
        0
      );
      
      await mockToken1.mint(await context.user1.getAddress(), paymentAmount);
      await mockToken1.connect(context.user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(context.user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);
      
      // Try to withdraw all tokens (only one has balance)
      const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
      await expect(
        proxy.connect(commerce1).withdrawAll(tokens)
      ).to.not.be.reverted;
      
      // Verify only the token with balance was withdrawn
      expect(await context.storage.balances(await commerce1.getAddress(), await mockToken1.getAddress())).to.equal(0);
    });

    it('should handle multiple withdrawals from same commerce', async () => {
      const { proxy, commerce1, mockToken1 } = context;
      
      // Setup commerce
      await context.accessManager.connect(context.onboarding).addCommerceToWhitelist(
        await commerce1.getAddress()
      );
      
      await context.accessManager.connect(context.onboarding).addTokenToCommerceWhitelist(
        await commerce1.getAddress(),
        [await mockToken1.getAddress()]
      );
      
      // Create and pay invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('multiple-withdrawals-invoice'));
      const paymentAmount = ethers.parseUnits('100', 6);
      
      await proxy.connect(context.backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{ token: await mockToken1.getAddress(), amount: paymentAmount }],
        0
      );
      
      await mockToken1.mint(await context.user1.getAddress(), paymentAmount);
      await mockToken1.connect(context.user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(context.user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);
      
      // Perform multiple partial withdrawals
      const withdrawAmount1 = ethers.parseUnits('30', 6);
      const withdrawAmount2 = ethers.parseUnits('40', 6);
      
      await proxy.connect(commerce1).withdrawTo(await mockToken1.getAddress(), withdrawAmount1, await commerce1.getAddress());
      await proxy.connect(commerce1).withdrawTo(await mockToken1.getAddress(), withdrawAmount2, await commerce1.getAddress());
      
      // Verify remaining balance (considering 1% service fee)
      const remainingBalance = await context.storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      const serviceFee = paymentAmount * 100n / 10000n; // 1% service fee (100 basis points)
      const netPayment = paymentAmount - serviceFee;
      const expectedRemaining = netPayment - withdrawAmount1 - withdrawAmount2;
      expect(remainingBalance).to.equal(expectedRemaining);
    });
  });
}); 