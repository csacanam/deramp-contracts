import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setupTest, TestContext } from '../1. setup/test-setup';

describe('Treasury Flow Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTest();
  });

  describe('Treasury Wallet Management', () => {
    it('should handle treasury wallet status management', async () => {
      const { proxy, storage, user1 } = context;

      // Add treasury wallet
      await proxy.addTreasuryWallet(await user1.getAddress(), "Test Treasury");

      // Verify wallet is active
      let walletInfo = await storage.getTreasuryWallet(await user1.getAddress());
      expect(walletInfo.wallet).to.equal(await user1.getAddress());
      expect(walletInfo.isActive).to.be.true;

      // Deactivate wallet
      await proxy.setTreasuryWalletStatus(await user1.getAddress(), false);
      walletInfo = await storage.getTreasuryWallet(await user1.getAddress());
      expect(walletInfo.isActive).to.be.false;

      // Reactivate wallet
      await proxy.setTreasuryWalletStatus(await user1.getAddress(), true);
      walletInfo = await storage.getTreasuryWallet(await user1.getAddress());
      expect(walletInfo.isActive).to.be.true;
    });
  });

  describe('Service Fee Collection and Distribution', () => {
    it('should collect service fees from multiple payments', async () => {
      const { 
        proxy, 
        storage, 
        accessManager,
        mockToken1, 
        commerce1, 
        user1, 
        user2, 
        user1: user3 
      } = context;

      const paymentAmount = ethers.parseUnits("100", 6);
      const defaultFeePercent = await accessManager.getDefaultFeePercent();
      const expectedFee = (paymentAmount * defaultFeePercent) / 10000n;

      // Create and pay multiple invoices
      for (let i = 0; i < 3; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`fee-collection-invoice-${i}`));
        
        await proxy.createInvoice(
          invoiceId,
          await commerce1.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: paymentAmount
          }],
          0
        );

        // Pay with different users
        const user = i === 0 ? user1 : i === 1 ? user2 : user3;
        await mockToken1.mint(await user.getAddress(), paymentAmount);
        await mockToken1.connect(user).approve(await proxy.getAddress(), paymentAmount);
        await proxy.connect(user).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);
      }

      // Verify total service fees collected
      const totalServiceFees = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      expect(totalServiceFees).to.equal(expectedFee * 3n);
    });

    it('should handle custom commerce fees', async () => {
      const { 
        proxy, 
        storage, 
        accessManager, 
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      // Set custom fee for commerce (0.5%)
      const customFee = 50; // 0.5%
      await accessManager.setCommerceFee(await commerce1.getAddress(), customFee);

      const paymentAmount = ethers.parseUnits("100", 6);
      const expectedFee = (paymentAmount * BigInt(customFee)) / 10000n;

      // Create and pay invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("custom-fee-invoice"));
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

      // Verify custom fee was applied
      const serviceFees = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      expect(serviceFees).to.equal(expectedFee);
    });
  });

  describe('Treasury Flow Analytics and Reporting', () => {
    it('should handle treasury wallet updates', async () => {
      const { proxy, storage, user1 } = context;

      // Add treasury wallet
      await proxy.addTreasuryWallet(await user1.getAddress(), "Original Name");

      // Update treasury wallet
      const updatedWallet = {
        wallet: await user1.getAddress(),
        isActive: true,
        addedAt: Math.floor(Date.now() / 1000),
        description: "Updated Name"
      };

      await proxy.updateTreasuryWallet(await user1.getAddress(), updatedWallet);

      // Verify update
      const walletInfo = await storage.getTreasuryWallet(await user1.getAddress());
      expect(walletInfo.description).to.equal("Updated Name");
    });
  });

  describe('Treasury Flow Integration with Other Modules', () => {
    it('should integrate with payment processing for fee collection', async () => {
      const { 
        proxy, 
        storage, 
        paymentProcessor, 
        accessManager,
        mockToken1, 
        commerce1, 
        user1 
      } = context;

      const paymentAmount = ethers.parseUnits("100", 6);
      const defaultFeePercent = await accessManager.getDefaultFeePercent();
      const expectedFee = (paymentAmount * defaultFeePercent) / 10000n;

      // Process payment through PaymentProcessor
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("payment-integration-invoice"));
      
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
      const paymentProcessorFees = await paymentProcessor.getServiceFeeBalance(await mockToken1.getAddress());
      const storageFees = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      
      expect(paymentProcessorFees).to.equal(expectedFee);
      expect(storageFees).to.equal(expectedFee);
    });
  });
}); 