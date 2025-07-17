import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { setupTest } from '../1. setup/test-setup';

describe('Complete User Workflow', () => {
  let context: any;

  beforeEach(async () => {
    context = await loadFixture(setupTest);
  });

  describe('Complete Commerce Onboarding to Payment Workflow', () => {
    it('should handle complete commerce onboarding to payment processing', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1, 
        mockToken2,
        user1, 
        user2, 
        commerce1,
        admin 
      } = context;

      // Step 1: Add mockToken2 to commerce1 whitelist (mockToken1 already whitelisted in setup)
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken2.getAddress()]);

      // Step 2: Commerce creates multiple invoices
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("complete-workflow-invoice-1"));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("complete-workflow-invoice-2"));
      
      const paymentAmount1 = ethers.parseUnits("500", 6);
      const paymentAmount2 = ethers.parseUnits("300", 6);

      await proxy.createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount1
        }],
        0
      );

      await proxy.createInvoice(
        invoiceId2,
        await commerce1.getAddress(),
        [{
          token: await mockToken2.getAddress(),
          amount: paymentAmount2
        }],
        0
      );

      // Step 3: Customers pay invoices
      await mockToken1.mint(await user1.getAddress(), paymentAmount1);
      await mockToken2.mint(await user2.getAddress(), paymentAmount2);

      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount1);
      await mockToken2.connect(user2).approve(await proxy.getAddress(), paymentAmount2);

      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), paymentAmount1);
      await proxy.connect(user2).payInvoice(invoiceId2, await mockToken2.getAddress(), paymentAmount2);

      // Step 4: Verify balances and fees
      // El fee por defecto es 1% (100 basis points)
      const feePercent = 100n; // 1% en basis points
      const expectedFee1 = paymentAmount1 * feePercent / 10000n;
      const expectedFee2 = paymentAmount2 * feePercent / 10000n;
      const expectedBalance1 = paymentAmount1 - expectedFee1;
      const expectedBalance2 = paymentAmount2 - expectedFee2;
      const balance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress());
      expect(balance1).to.equal(expectedBalance1);
      expect(balance2).to.equal(expectedBalance2);

      // Step 5: Commerce withdraws funds
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      await proxy.connect(commerce1).withdraw(await mockToken2.getAddress());

      // Step 6: Verify withdrawals
      const finalBalance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const finalBalance2 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress());
      
      expect(finalBalance1).to.equal(0);
      expect(finalBalance2).to.equal(0);

      // Step 7: Verify withdrawal records
      const withdrawals = await storage.getCommerceWithdrawals(await commerce1.getAddress());
      expect(withdrawals.length).to.equal(2);
    });

    it('should handle multi-token invoice workflow', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1, 
        mockToken2,
        user1, 
        commerce1,
        admin 
      } = context;

      // Add mockToken2 to commerce1 whitelist
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken2.getAddress()]);

      // Create separate invoices for each token
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("multi-token-workflow-invoice-1"));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("multi-token-workflow-invoice-2"));
      const amount1 = ethers.parseUnits("200", 6);
      const amount2 = ethers.parseUnits("150", 6);

      await proxy.createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount1
        }],
        0
      );

      await proxy.createInvoice(
        invoiceId2,
        await commerce1.getAddress(),
        [{
          token: await mockToken2.getAddress(),
          amount: amount2
        }],
        0
      );

      // Customer pays each invoice separately
      await mockToken1.mint(await user1.getAddress(), amount1);
      await mockToken2.mint(await user1.getAddress(), amount2);

      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount1);
      await mockToken2.connect(user1).approve(await proxy.getAddress(), amount2);

      // Pay each invoice separately
      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), amount1);
      await proxy.connect(user1).payInvoice(invoiceId2, await mockToken2.getAddress(), amount2);

      // Verify balances
      const feePercent = 100n;
      const expectedFee1 = amount1 * feePercent / 10000n;
      const expectedFee2 = amount2 * feePercent / 10000n;
      const expectedBalance1 = amount1 - expectedFee1;
      const expectedBalance2 = amount2 - expectedFee2;
      const balance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress());
      
      expect(balance1).to.equal(expectedBalance1);
      expect(balance2).to.equal(expectedBalance2);

      // Commerce withdraws all tokens
      await proxy.connect(commerce1).withdrawAll([await mockToken1.getAddress(), await mockToken2.getAddress()]);

      // Verify final state
      const finalBalance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const finalBalance2 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress());
      
      expect(finalBalance1).to.equal(0);
      expect(finalBalance2).to.equal(0);
    });
  });

  describe('Complete Treasury Management Workflow', () => {
    it('should handle complete treasury fee collection and management', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        treasuryManager,
        mockToken1, 
        mockToken2,
        user1, 
        user2, 
        commerce1,
        commerce2,
        admin 
      } = context;

      // Create and pay invoices with fees
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("treasury-workflow-invoice-1"));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("treasury-workflow-invoice-2"));
      
      const amount1 = ethers.parseUnits("1000", 6);
      const amount2 = ethers.parseUnits("800", 6);
      const fee1 = ethers.parseUnits("10", 6); // 1% fee
      const fee2 = ethers.parseUnits("8", 6);  // 1% fee

      await proxy.createInvoice(invoiceId1, await commerce1.getAddress(), [{
        token: await mockToken1.getAddress(),
        amount: amount1
      }], 0);

      await proxy.createInvoice(invoiceId2, await commerce2.getAddress(), [{
        token: await mockToken2.getAddress(),
        amount: amount2
      }], 0);

      // Pay invoices
      await mockToken1.mint(await user1.getAddress(), amount1);
      await mockToken2.mint(await user2.getAddress(), amount2);

      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount1);
      await mockToken2.connect(user2).approve(await proxy.getAddress(), amount2);

      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), amount1);
      await proxy.connect(user2).payInvoice(invoiceId2, await mockToken2.getAddress(), amount2);

      // Verify service fees accumulated
      const serviceFees1 = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      const serviceFees2 = await storage.getServiceFeeBalance(await mockToken2.getAddress());
      
      // Los service fees se calculan automáticamente (1% por defecto)
      const expectedFee1 = amount1 * 100n / 10000n; // 1% fee
      const expectedFee2 = amount2 * 100n / 10000n; // 1% fee
      
      expect(serviceFees1).to.equal(expectedFee1);
      expect(serviceFees2).to.equal(expectedFee2);

      // Verify commerce balances (amount minus service fee)
      const commerceBalance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const commerceBalance2 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken2.getAddress());
      
      expect(commerceBalance1).to.equal(amount1 - expectedFee1);
      expect(commerceBalance2).to.equal(amount2 - expectedFee2);
    });
  });

  describe('Complete Multi-Commerce Ecosystem Workflow', () => {
    it('should handle multiple commerces with complex interactions', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1, 
        mockToken2,
        user1, 
        user2, 
        commerce1,
        commerce2,
        admin 
      } = context;

      // Create invoices for each commerce
      const invoices = [];
      const amounts = [
        ethers.parseUnits("100", 6),
        ethers.parseUnits("200", 6),
        ethers.parseUnits("150", 6),
        ethers.parseUnits("300", 6)
      ];

      for (let i = 0; i < 4; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`ecosystem-invoice-${i}`));
        const commerce = i < 2 ? commerce1 : commerce2;
        const token = i < 3 ? mockToken1 : mockToken2;
        
        await proxy.createInvoice(
          invoiceId,
          await commerce.getAddress(),
          [{
            token: await token.getAddress(),
            amount: amounts[i]
          }],
          0
        );
        invoices.push({ id: invoiceId, commerce, token, amount: amounts[i] });
      }

      // Pay all invoices
      const totalAmount1 = amounts[0] + amounts[1] + amounts[2];
      const totalAmount2 = amounts[3];

      await mockToken1.mint(await user1.getAddress(), totalAmount1);
      await mockToken2.mint(await user2.getAddress(), totalAmount2);

      await mockToken1.connect(user1).approve(await proxy.getAddress(), totalAmount1);
      await mockToken2.connect(user2).approve(await proxy.getAddress(), totalAmount2);

      for (const invoice of invoices) {
        if (invoice.token === mockToken1) {
          await proxy.connect(user1).payInvoice(invoice.id, await mockToken1.getAddress(), invoice.amount);
        } else {
          await proxy.connect(user2).payInvoice(invoice.id, await mockToken2.getAddress(), invoice.amount);
        }
      }

      // Verify all balances
      const feePercent = 100n;
      const expectedFee0 = amounts[0] * feePercent / 10000n;
      const expectedFee1 = amounts[1] * feePercent / 10000n;
      const expectedFee2 = amounts[2] * feePercent / 10000n;
      const expectedFee3 = amounts[3] * feePercent / 10000n;
      const expectedBalance1 = (amounts[0] - expectedFee0) + (amounts[1] - expectedFee1);
      const expectedBalance2 = (amounts[2] - expectedFee2);
      const expectedBalance3 = (amounts[3] - expectedFee3);
      const balance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken1.getAddress());
      const balance3 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken2.getAddress());
      
      expect(balance1).to.equal(expectedBalance1);
      expect(balance2).to.equal(expectedBalance2);
      expect(balance3).to.equal(expectedBalance3);

      // All commerces withdraw their funds
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      await proxy.connect(commerce2).withdraw(await mockToken1.getAddress());
      await proxy.connect(commerce2).withdraw(await mockToken2.getAddress());

      // Verify all balances are zero
      const finalBalance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const finalBalance2 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken1.getAddress());
      const finalBalance3 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken2.getAddress());
      
      expect(finalBalance1).to.equal(0);
      expect(finalBalance2).to.equal(0);
      expect(finalBalance3).to.equal(0);
    });
  });

  describe('Complete Error Handling and Recovery Workflow', () => {
    it('should handle errors gracefully and allow recovery', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Test 1: Try to pay non-existent invoice
      const fakeInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("non-existent-invoice"));
      await mockToken1.mint(await user1.getAddress(), ethers.parseUnits("100", 6));
      await mockToken1.connect(user1).approve(await proxy.getAddress(), ethers.parseUnits("100", 6));
      
      await expect(
        proxy.connect(user1).payInvoice(fakeInvoiceId, await mockToken1.getAddress(), ethers.parseUnits("100", 6))
      ).to.be.reverted;

      // Test 2: Try to withdraw without balance
      await expect(
        proxy.connect(commerce1).withdraw(await mockToken1.getAddress())
      ).to.be.revertedWith("No funds to withdraw [PX]");

      // Test 3: Create and pay invoice successfully after errors
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("recovery-invoice"));
      const amount = ethers.parseUnits("500", 6);

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      // Mint and approve the correct amount
      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);

      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount);

      // Verify successful recovery
      const feePercent = 100n;
      const expectedFee = amount * feePercent / 10000n;
      const expectedBalance = amount - expectedFee;
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.equal(expectedBalance);

      // Successful withdrawal
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      const finalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(finalBalance).to.equal(0);
    });
  });
}); 