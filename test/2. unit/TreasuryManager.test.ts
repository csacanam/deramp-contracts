import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setupTest, TestContext } from '../1. setup/test-setup';

describe('TreasuryManager', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTest();
  });

  describe('Treasury Wallet Management', () => {
    it('should add treasury wallet successfully', async () => {
      const { proxy, treasuryManager, admin } = context;
      const treasuryWallet = await admin.getAddress();
      const description = 'Main Treasury Wallet';

      await expect(
        proxy.connect(admin).addTreasuryWallet(treasuryWallet, description)
      ).to.not.be.reverted;

      const wallet = await treasuryManager.getTreasuryWallet(treasuryWallet);
      expect(wallet.wallet).to.equal(treasuryWallet);
      expect(wallet.isActive).to.be.true;
      expect(wallet.description).to.equal(description);
      expect(wallet.addedAt).to.be.greaterThan(0);
    });

    it('should reject adding zero address as treasury wallet', async () => {
      const { proxy, admin } = context;
      const description = 'Invalid Treasury Wallet';

      await expect(
        proxy.connect(admin).addTreasuryWallet(ethers.ZeroAddress, description)
      ).to.be.revertedWith('TreasuryManager call failed');
    });

    it('should remove treasury wallet successfully', async () => {
      const { proxy, treasuryManager, admin, backend } = context;
      const treasuryWallet = await admin.getAddress();
      const description = 'Treasury to Remove';

      // Add wallet first
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, description);

      // Remove wallet
      await expect(
        proxy.connect(admin).removeTreasuryWallet(treasuryWallet)
      ).to.not.be.reverted;

      // Verify wallet is removed from list
      const allWallets = await treasuryManager.getAllTreasuryWallets();
      expect(allWallets).to.not.include(treasuryWallet);
    });

    it('should set treasury wallet status', async () => {
      const { proxy, treasuryManager, admin } = context;
      const treasuryWallet = await admin.getAddress();
      const description = 'Status Test Wallet';

      // Add wallet first
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, description);

      // Deactivate wallet
      await expect(
        proxy.connect(admin).setTreasuryWalletStatus(treasuryWallet, false)
      ).to.not.be.reverted;

      // Verify status
      expect(await treasuryManager.isTreasuryWalletActive(treasuryWallet)).to.be.false;

      // Reactivate wallet
      await expect(
        proxy.connect(admin).setTreasuryWalletStatus(treasuryWallet, true)
      ).to.not.be.reverted;

      // Verify status
      expect(await treasuryManager.isTreasuryWalletActive(treasuryWallet)).to.be.true;
    });

    it('should update treasury wallet', async () => {
      const { proxy, treasuryManager, admin } = context;
      const treasuryWallet = await admin.getAddress();
      const initialDescription = 'Initial Description';
      const updatedDescription = 'Updated Description';

      // Add wallet first
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, initialDescription);

      // Update wallet
      const block = await ethers.provider.getBlock('latest');
      const updatedWallet = {
        wallet: treasuryWallet,
        isActive: true,
        addedAt: block?.timestamp || 0,
        description: updatedDescription
      };

      await expect(
        proxy.connect(admin).updateTreasuryWallet(treasuryWallet, updatedWallet)
      ).to.not.be.reverted;

      // Verify update
      const wallet = await treasuryManager.getTreasuryWallet(treasuryWallet);
      expect(wallet.description).to.equal(updatedDescription);
    });

    it('should get all treasury wallets', async () => {
      const { proxy, treasuryManager, admin, backend, treasury } = context;
      const wallet1 = await admin.getAddress();
      const wallet2 = await backend.getAddress();
      const wallet3 = await treasury.getAddress();

      // Add multiple wallets
      await proxy.connect(admin).addTreasuryWallet(wallet1, 'Wallet 1');
      await proxy.connect(admin).addTreasuryWallet(wallet2, 'Wallet 2');
      await proxy.connect(admin).addTreasuryWallet(wallet3, 'Wallet 3');

      const allWallets = await treasuryManager.getAllTreasuryWallets();
      expect(allWallets).to.include(wallet1);
      expect(allWallets).to.include(wallet2);
      expect(allWallets).to.include(wallet3);
      expect(allWallets.length).to.equal(3);
    });

    it('should get active treasury wallets only', async () => {
      const { proxy, treasuryManager, admin, backend, treasury } = context;
      const wallet1 = await admin.getAddress();
      const wallet2 = await backend.getAddress();
      const wallet3 = await treasury.getAddress();

      // Add multiple wallets
      await proxy.connect(admin).addTreasuryWallet(wallet1, 'Wallet 1');
      await proxy.connect(admin).addTreasuryWallet(wallet2, 'Wallet 2');
      await proxy.connect(admin).addTreasuryWallet(wallet3, 'Wallet 3');

      // Deactivate one wallet
      await proxy.connect(admin).setTreasuryWalletStatus(wallet2, false);

      const activeWallets = await treasuryManager.getActiveTreasuryWallets();
      expect(activeWallets).to.include(wallet1);
      expect(activeWallets).to.include(wallet3);
      expect(activeWallets).to.not.include(wallet2);
      expect(activeWallets.length).to.equal(2);
    });
  });

  describe('Service Fee Withdrawals', () => {
    beforeEach(async () => {
      // Ensure there are service fees for both tokens before each withdrawal test
      const { proxy, admin, backend, commerce1, user1, mockToken1, mockToken2 } = context;
      // Add treasury wallet
      const treasuryWallet = await admin.getAddress();
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, 'Treasury Wallet');
      // Whitelist tokens for commerce1
      await context.accessManager.connect(context.onboarding).addTokenToCommerceWhitelist(
        await commerce1.getAddress(),
        [await mockToken1.getAddress(), await mockToken2.getAddress()]
      );
      // Create invoices
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
      
      // Verify that proxy has the service fees (they should be there from payments)
      const serviceFee1 = await context.storage.getServiceFeeBalance(await mockToken1.getAddress());
      const serviceFee2 = await context.storage.getServiceFeeBalance(await mockToken2.getAddress());
      expect(serviceFee1).to.be.greaterThan(0);
      expect(serviceFee2).to.be.greaterThan(0);
      
      // Verify proxy has the tokens (they were transferred during payment)
      const proxyBalance1 = await mockToken1.balanceOf(await proxy.getAddress());
      const proxyBalance2 = await mockToken2.balanceOf(await proxy.getAddress());
      expect(proxyBalance1).to.be.greaterThanOrEqual(serviceFee1);
      expect(proxyBalance2).to.be.greaterThanOrEqual(serviceFee2);
    });

    it('should withdraw service fees to treasury successfully', async () => {
      const { proxy, admin, mockToken1 } = context;
      const treasuryWallet = await admin.getAddress();
      const initialBalance = await mockToken1.balanceOf(treasuryWallet);
      const serviceFeeBalance = await context.storage.getServiceFeeBalance(await mockToken1.getAddress());
      expect(serviceFeeBalance).to.be.greaterThan(0);
      await expect(
        proxy.connect(admin).withdrawServiceFeesToTreasury(await mockToken1.getAddress(), treasuryWallet)
      ).to.not.be.reverted;
      const finalBalance = await mockToken1.balanceOf(treasuryWallet);
      expect(finalBalance).to.equal(initialBalance + serviceFeeBalance);
      expect(await context.storage.getServiceFeeBalance(await mockToken1.getAddress())).to.equal(0);
    });

    it('should reject withdrawal to inactive treasury wallet', async () => {
      const { proxy, admin, mockToken1, backend } = context;
      const treasuryWallet = await backend.getAddress();
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, 'Inactive Wallet');
      await proxy.connect(admin).setTreasuryWalletStatus(treasuryWallet, false);
      await expect(
        proxy.connect(admin).withdrawServiceFeesToTreasury(await mockToken1.getAddress(), treasuryWallet)
      ).to.be.revertedWith('TreasuryManager call failed');
    });

    it('should reject withdrawal to zero address', async () => {
      const { proxy, admin, mockToken1 } = context;
      await expect(
        proxy.connect(admin).withdrawServiceFeesToTreasury(await mockToken1.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith('TreasuryManager call failed');
    });

    it('should reject withdrawal when no service fees available', async () => {
      const { proxy, admin, backend } = context;
      const treasuryWallet = await backend.getAddress();
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, 'Empty Treasury');
      // Use a new token with no service fees
      const newToken = await ethers.deployContract('MockERC20', ['New Token', 'NEW', 6]);
      await expect(
        proxy.connect(admin).withdrawServiceFeesToTreasury(await newToken.getAddress(), treasuryWallet)
      ).to.be.revertedWith('No service fees to withdraw [PX]');
    });

    it('should withdraw all service fees to treasury', async () => {
      const { proxy, admin, mockToken1, mockToken2 } = context;
      const treasuryWallet = await admin.getAddress();
      const initialBalance1 = await mockToken1.balanceOf(treasuryWallet);
      const initialBalance2 = await mockToken2.balanceOf(treasuryWallet);
      const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
      await expect(
        proxy.connect(admin).withdrawAllServiceFeesToTreasury(tokens, treasuryWallet)
      ).to.not.be.reverted;
      const finalBalance1 = await mockToken1.balanceOf(treasuryWallet);
      const finalBalance2 = await mockToken2.balanceOf(treasuryWallet);
      expect(finalBalance1).to.be.greaterThan(initialBalance1);
      expect(finalBalance2).to.be.greaterThan(initialBalance2);
      expect(await context.storage.getServiceFeeBalance(await mockToken1.getAddress())).to.equal(0);
      expect(await context.storage.getServiceFeeBalance(await mockToken2.getAddress())).to.equal(0);
    });

    it('should withdraw all service fees to treasury (no tokens parameter)', async () => {
      const { proxy, admin, mockToken1, mockToken2 } = context;
      const treasuryWallet = await admin.getAddress();
      const initialBalance1 = await mockToken1.balanceOf(treasuryWallet);
      const initialBalance2 = await mockToken2.balanceOf(treasuryWallet);
      await expect(
        proxy.connect(admin).withdrawAllServiceFeesToTreasuryAll(treasuryWallet)
      ).to.not.be.reverted;
      const finalBalance1 = await mockToken1.balanceOf(treasuryWallet);
      const finalBalance2 = await mockToken2.balanceOf(treasuryWallet);
      expect(finalBalance1).to.be.greaterThan(initialBalance1);
      expect(finalBalance2).to.be.greaterThan(initialBalance2);
    });

    it('should reject withdrawal with empty tokens array', async () => {
      const { proxy, admin } = context;
      const treasuryWallet = await admin.getAddress();
      const emptyTokens: string[] = [];
      await expect(
        proxy.connect(admin).withdrawAllServiceFeesToTreasury(emptyTokens, treasuryWallet)
      ).to.be.revertedWith('No tokens provided [PX]');
    });
  });

  describe('View Functions', () => {
    beforeEach(async () => {
      // Generate service fees and withdrawals for statistics
      const { proxy, admin, backend, commerce1, user1, mockToken1, mockToken2 } = context;
      const treasuryWallet = await admin.getAddress();
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, 'Stats Treasury');
      await context.accessManager.connect(context.onboarding).addTokenToCommerceWhitelist(
        await commerce1.getAddress(),
        [await mockToken1.getAddress(), await mockToken2.getAddress()]
      );
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes('stats-invoice-1'));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes('stats-invoice-2'));
      const paymentAmount = ethers.parseUnits('10', 6);
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
      
      // Verify that proxy has the service fees (they should be there from payments)
      const serviceFee1 = await context.storage.getServiceFeeBalance(await mockToken1.getAddress());
      const serviceFee2 = await context.storage.getServiceFeeBalance(await mockToken2.getAddress());
      expect(serviceFee1).to.be.greaterThan(0);
      expect(serviceFee2).to.be.greaterThan(0);
      
      // Verify proxy has the tokens (they were transferred during payment)
      const proxyBalance1 = await mockToken1.balanceOf(await proxy.getAddress());
      const proxyBalance2 = await mockToken2.balanceOf(await proxy.getAddress());
      expect(proxyBalance1).to.be.greaterThanOrEqual(serviceFee1);
      expect(proxyBalance2).to.be.greaterThanOrEqual(serviceFee2);
      
      // Only withdraw if there are service fees available
      if (serviceFee1 > 0) {
        await proxy.connect(admin).withdrawServiceFeesToTreasury(await mockToken1.getAddress(), treasuryWallet);
      }
      if (serviceFee2 > 0) {
        await proxy.connect(admin).withdrawServiceFeesToTreasury(await mockToken2.getAddress(), treasuryWallet);
      }
    });

    it('should return correct treasury wallet information', async () => {
      const { proxy, treasuryManager, admin } = context;
      const treasuryWallet = await admin.getAddress();
      const description = 'Test Wallet Info';

      // Add wallet
      await proxy.connect(admin).addTreasuryWallet(treasuryWallet, description);

      // Get wallet info
      const wallet = await treasuryManager.getTreasuryWallet(treasuryWallet);
      expect(wallet.wallet).to.equal(treasuryWallet);
      expect(wallet.isActive).to.be.true;
      expect(wallet.description).to.equal(description);
      expect(wallet.addedAt).to.be.greaterThan(0);
    });

    it('should return empty array for non-existent treasury wallet', async () => {
      const { treasuryManager } = context;
      const nonExistentWallet = ethers.Wallet.createRandom().address;

      const wallet = await treasuryManager.getTreasuryWallet(nonExistentWallet);
      expect(wallet.wallet).to.equal(ethers.ZeroAddress);
      expect(wallet.isActive).to.be.false;
      expect(wallet.description).to.equal('');
      expect(wallet.addedAt).to.equal(0);
    });

    it('should return correct treasury wallets array', async () => {
      const { proxy, treasuryManager, admin, backend, treasury } = context;
      const wallet1 = await admin.getAddress();
      const wallet2 = await backend.getAddress();
      const wallet3 = await treasury.getAddress();

      // Add wallets
      await proxy.connect(admin).addTreasuryWallet(wallet1, 'Wallet 1');
      await proxy.connect(admin).addTreasuryWallet(wallet2, 'Wallet 2');
      await proxy.connect(admin).addTreasuryWallet(wallet3, 'Wallet 3');

      const wallets = await treasuryManager.getTreasuryWallets();
      // Adjusted to expect 4 wallets (one from setup + 3 added here)
      expect(wallets.length).to.equal(4);
      expect(wallets[wallets.length-3].wallet).to.equal(wallet1);
      expect(wallets[wallets.length-2].wallet).to.equal(wallet2);
      expect(wallets[wallets.length-1].wallet).to.equal(wallet3);
    });

    it('should return correct service fee withdrawal statistics', async () => {
      const { treasuryManager } = context;
      const stats = await treasuryManager.getServiceFeeWithdrawalStats();
      expect(stats.totalWithdrawals).to.equal(2);
      expect(stats.tokens.length).to.equal(2);
      expect(stats.treasuryWalletList.length).to.equal(1);
      expect(stats.totalAmountByToken.length).to.equal(2);
      expect(stats.amountsByTreasury.length).to.equal(1);
      expect(stats.amountsByTreasury[0].length).to.equal(2);
    });
  });

  describe('Access Control', () => {
    it('should only allow proxy to call treasury functions', async () => {
      const { treasuryManager, admin, mockToken1 } = context;
      const treasuryWallet = await admin.getAddress();

      // Direct calls to TreasuryManager should fail
      await expect(
        treasuryManager.connect(admin).addTreasuryWallet(treasuryWallet, 'Direct Call Test')
      ).to.be.revertedWith('Only proxy can call');

      await expect(
        treasuryManager.connect(admin).withdrawServiceFeesToTreasury(await mockToken1.getAddress(), treasuryWallet)
      ).to.be.revertedWith('Only proxy can call');
    });

    it('should allow proxy to call treasury functions', async () => {
      const { proxy, admin } = context;
      const treasuryWallet = await admin.getAddress();

      // Calls through proxy should succeed
      await expect(
        proxy.connect(admin).addTreasuryWallet(treasuryWallet, 'Proxy Call Test')
      ).to.not.be.reverted;
    });
  });
}); 