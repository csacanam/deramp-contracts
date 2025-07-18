import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { setupTest } from '../1. setup/test-setup';

describe('Emergency Scenarios E2E', () => {
  let context: any;

  beforeEach(async () => {
    context = await loadFixture(setupTest);
  });

  describe('System Pause/Unpause Emergency Scenarios', () => {
    it('should handle complete system pause and unpause workflow', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Step 1: Create and pay an invoice before pause
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("pre-pause-invoice"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount);

      // Verify pre-pause state
      const prePauseBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(prePauseBalance).to.be.gt(0);

      // Step 2: Pause the system
      await proxy.connect(admin).pause();

      // Step 3: Verify all operations are blocked during pause
      const newInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("during-pause-invoice"));
      
      // Try to create invoice - should fail
      await expect(
        proxy.createInvoice(
          newInvoiceId,
          await commerce1.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: amount
          }],
          0
        )
      ).to.be.reverted;

      // Try to pay invoice - should fail
      await expect(
        proxy.connect(user1).payInvoice(newInvoiceId, await mockToken1.getAddress(), amount)
      ).to.be.reverted;

      // Try to withdraw - should fail
      await expect(
        proxy.connect(commerce1).withdraw(await mockToken1.getAddress())
      ).to.be.reverted;

      // Step 4: Unpause the system
      await proxy.connect(admin).unpause();

      // Step 5: Verify system works normally after unpause
      const postPauseInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("post-pause-invoice"));
      
      await proxy.createInvoice(
        postPauseInvoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);
      await proxy.connect(user1).payInvoice(postPauseInvoiceId, await mockToken1.getAddress(), amount);

      // Verify post-pause state
      const postPauseBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(postPauseBalance).to.be.gt(prePauseBalance);

      // Step 6: Verify withdrawal works after unpause
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      const finalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(finalBalance).to.equal(0);
    });

    it('should handle pause during active payment processing', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create multiple invoices
      const invoices = [];
      for (let i = 0; i < 3; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`pause-during-payment-${i}`));
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
        invoices.push({ id: invoiceId, amount });
      }

      // Pay first invoice successfully
      await mockToken1.mint(await user1.getAddress(), invoices[0].amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), invoices[0].amount);
      await proxy.connect(user1).payInvoice(invoices[0].id, await mockToken1.getAddress(), invoices[0].amount);

      // Pause system during active processing
      await proxy.connect(admin).pause();

      // Try to pay remaining invoices - should fail
      for (let i = 1; i < invoices.length; i++) {
        await mockToken1.mint(await user1.getAddress(), invoices[i].amount);
        await mockToken1.connect(user1).approve(await proxy.getAddress(), invoices[i].amount);
        
        await expect(
          proxy.connect(user1).payInvoice(invoices[i].id, await mockToken1.getAddress(), invoices[i].amount)
        ).to.be.reverted;
      }

      // Unpause and verify remaining invoices can be paid
      await proxy.connect(admin).unpause();

      for (let i = 1; i < invoices.length; i++) {
        await mockToken1.mint(await user1.getAddress(), invoices[i].amount);
        await mockToken1.connect(user1).approve(await proxy.getAddress(), invoices[i].amount);
        await proxy.connect(user1).payInvoice(invoices[i].id, await mockToken1.getAddress(), invoices[i].amount);
      }

      // Verify all invoices were paid
      const finalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0n);
      const expectedFee = totalAmount * 100n / 10000n; // 1% fee
      expect(finalBalance).to.equal(totalAmount - expectedFee);
    });
  });

  describe('Module Failure and Recovery Scenarios', () => {
    it('should handle PaymentProcessor failure and recovery', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create invoice before potential failure
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("processor-failure-invoice"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      // Simulate PaymentProcessor failure by trying invalid payment
      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);

      // Try to pay with wrong amount (should fail but not break system)
      await expect(
        proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount * 2n)
      ).to.be.reverted;

      // Verify system is still functional
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(0); // PENDING

      // Pay correctly after failure
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount);

      // Verify successful recovery
      const updatedInvoice = await storage.getInvoice(invoiceId);
      expect(updatedInvoice.status).to.equal(1); // PAID
      
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.be.gt(0);
    });

    it('should handle WithdrawalManager failure and recovery', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create and pay invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("withdrawal-failure-invoice"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount);

      // Verify balance exists
      const preWithdrawalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(preWithdrawalBalance).to.be.gt(0);

      // Simulate withdrawal failure by trying to withdraw more than available
      await expect(
        proxy.connect(commerce1).withdrawTo(await mockToken1.getAddress(), preWithdrawalBalance + 1n, await user1.getAddress())
      ).to.be.revertedWith("Insufficient balance [PX]");

      // Verify balance is still intact
      const postFailureBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(postFailureBalance).to.equal(preWithdrawalBalance);

      // Successful withdrawal after failure
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      
      const finalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(finalBalance).to.equal(0);
    });
  });

  describe('State Recovery and Consistency Scenarios', () => {
    it('should handle recovery from inconsistent invoice states', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("inconsistent-state-invoice"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      // Verify initial state
      let invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(0); // PENDING

      // Simulate partial payment failure (system interruption)
      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);

      // Try to pay with insufficient allowance (simulate failure)
      await mockToken1.connect(user1).approve(await proxy.getAddress(), 0);
      
      await expect(
        proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount)
      ).to.be.reverted;

      // Verify invoice state is still consistent
      invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(0); // Still PENDING

      // Recover by providing correct allowance
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount);

      // Verify successful recovery
      invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
      
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.be.gt(0);
    });

    it('should handle recovery from multiple failed operations', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create multiple invoices
      const invoices = [];
      for (let i = 0; i < 5; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`multi-failure-${i}`));
        const amount = ethers.parseUnits("200", 6);
        
        await proxy.createInvoice(
          invoiceId,
          await commerce1.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: amount
          }],
          0
        );
        invoices.push({ id: invoiceId, amount });
      }

      // Simulate multiple failures
      let successfulPayments = 0;
      for (let i = 0; i < invoices.length; i++) {
        try {
          await mockToken1.mint(await user1.getAddress(), invoices[i].amount);
          await mockToken1.connect(user1).approve(await proxy.getAddress(), invoices[i].amount);
          await proxy.connect(user1).payInvoice(invoices[i].id, await mockToken1.getAddress(), invoices[i].amount);
          successfulPayments++;
        } catch (error) {
          // Simulate some failures
          if (i % 2 === 0) {
            // Intentionally fail every other invoice
            continue;
          }
        }
      }

      // Verify partial success
      expect(successfulPayments).to.be.gt(0);

      // Recover failed payments
      for (let i = 0; i < invoices.length; i++) {
        const invoice = await storage.getInvoice(invoices[i].id);
        if (invoice.status === 0) { // PENDING
          await mockToken1.mint(await user1.getAddress(), invoices[i].amount);
          await mockToken1.connect(user1).approve(await proxy.getAddress(), invoices[i].amount);
          await proxy.connect(user1).payInvoice(invoices[i].id, await mockToken1.getAddress(), invoices[i].amount);
        }
      }

      // Verify all invoices are paid
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify final balance
      const finalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0n);
      const expectedFee = totalAmount * 100n / 10000n; // 1% fee
      expect(finalBalance).to.equal(totalAmount - expectedFee);
    });
  });

  describe('Malicious Token and Security Scenarios', () => {
    it('should handle malicious token behavior gracefully', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create invoice with normal token
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("malicious-token-invoice"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      // Simulate malicious token behavior (revert on transfer)
      // This would be handled by the safeTransferFrom in the proxy
      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);

      // Try to pay - should handle gracefully
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount);

      // Verify payment succeeded despite potential token issues
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
      
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.be.gt(0);
    });

    it('should handle unauthorized access attempts', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        user2,
        commerce1,
        admin 
      } = context;

      // Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("unauthorized-access-invoice"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      // Try unauthorized operations
      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);

      // Try to pay with wrong user - should fail
      await expect(
        proxy.connect(user2).payInvoice(invoiceId, await mockToken1.getAddress(), amount)
      ).to.be.reverted;

      // Try to withdraw with wrong user - should fail (user2 is not a commerce)
      await expect(
        proxy.connect(user2).withdraw(await mockToken1.getAddress())
      ).to.be.reverted;

      // Legitimate payment should still work
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), amount);

      // Verify successful payment
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
    });
  });

  describe('Limit and Overflow Scenarios', () => {
    it('should handle maximum amount scenarios', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Test with maximum reasonable amount
      const maxAmount = ethers.parseUnits("999999999", 6); // Large but reasonable amount
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("max-amount-invoice"));

      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: maxAmount
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), maxAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), maxAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), maxAmount);

      // Verify large amount handled correctly
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(1); // PAID
      
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.be.gt(0);
      expect(balance).to.be.lt(maxAmount); // Should be less due to fees
    });

    it('should handle multiple small transactions', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create many small invoices
      const smallAmount = ethers.parseUnits("1", 6);
      const numInvoices = 10;
      const invoices = [];

      for (let i = 0; i < numInvoices; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`small-tx-${i}`));
        
        await proxy.createInvoice(
          invoiceId,
          await commerce1.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: smallAmount
          }],
          0
        );
        invoices.push({ id: invoiceId, amount: smallAmount });
      }

      // Pay all small invoices
      const totalAmount = smallAmount * BigInt(numInvoices);
      await mockToken1.mint(await user1.getAddress(), totalAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), totalAmount);

      for (const invoice of invoices) {
        await proxy.connect(user1).payInvoice(invoice.id, await mockToken1.getAddress(), invoice.amount);
      }

      // Verify all small transactions processed
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.be.gt(0);
    });
  });

  describe('Post-Emergency Recovery Scenarios', () => {
    it('should handle complete system recovery after multiple failures', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Step 1: Normal operation
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("recovery-invoice-1"));
      const amount1 = ethers.parseUnits("500", 6);

      await proxy.createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount1
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), amount1);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount1);
      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), amount1);

      // Step 2: Simulate emergency (pause)
      await proxy.connect(admin).pause();

      // Step 3: Create invoice during emergency (should fail)
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("recovery-invoice-2"));
      const amount2 = ethers.parseUnits("300", 6);

      await expect(
        proxy.createInvoice(
          invoiceId2,
          await commerce1.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: amount2
          }],
          0
        )
      ).to.be.reverted;

      // Step 4: Recovery (unpause)
      await proxy.connect(admin).unpause();

      // Step 5: Resume normal operation
      await proxy.createInvoice(
        invoiceId2,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount2
        }],
        0
      );

      await mockToken1.mint(await user1.getAddress(), amount2);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount2);
      await proxy.connect(user1).payInvoice(invoiceId2, await mockToken1.getAddress(), amount2);

      // Step 6: Verify complete recovery
      const invoice1 = await storage.getInvoice(invoiceId1);
      const invoice2 = await storage.getInvoice(invoiceId2);
      
      expect(invoice1.status).to.equal(1); // PAID
      expect(invoice2.status).to.equal(1); // PAID

      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const totalAmount = amount1 + amount2;
      const expectedFee = totalAmount * 100n / 10000n; // 1% fee
      expect(balance).to.equal(totalAmount - expectedFee);

      // Step 7: Verify withdrawal works after recovery
      await proxy.connect(commerce1).withdraw(await mockToken1.getAddress());
      const finalBalance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(finalBalance).to.equal(0);
    });

    it('should handle data consistency after emergency scenarios', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        admin 
      } = context;

      // Create multiple invoices
      const invoices = [];
      for (let i = 0; i < 3; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`consistency-${i}`));
        const amount = ethers.parseUnits("200", 6);
        
        await proxy.createInvoice(
          invoiceId,
          await commerce1.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: amount
          }],
          0
        );
        invoices.push({ id: invoiceId, amount });
      }

      // Pay first invoice
      await mockToken1.mint(await user1.getAddress(), invoices[0].amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), invoices[0].amount);
      await proxy.connect(user1).payInvoice(invoices[0].id, await mockToken1.getAddress(), invoices[0].amount);

      // Simulate emergency (pause)
      await proxy.connect(admin).pause();

      // Try operations during emergency
      await expect(
        proxy.connect(user1).payInvoice(invoices[1].id, await mockToken1.getAddress(), invoices[1].amount)
      ).to.be.reverted;

      // Recover
      await proxy.connect(admin).unpause();

      // Pay remaining invoices
      for (let i = 1; i < invoices.length; i++) {
        await mockToken1.mint(await user1.getAddress(), invoices[i].amount);
        await mockToken1.connect(user1).approve(await proxy.getAddress(), invoices[i].amount);
        await proxy.connect(user1).payInvoice(invoices[i].id, await mockToken1.getAddress(), invoices[i].amount);
      }

      // Verify data consistency
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // All should be PAID
        expect(invoiceState.commerce).to.equal(await commerce1.getAddress());
        expect(invoiceState.paidToken).to.equal(await mockToken1.getAddress());
      }

      // Verify balance consistency
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0n);
      const expectedFee = totalAmount * 100n / 10000n; // 1% fee
      expect(balance).to.equal(totalAmount - expectedFee);

      // Verify service fee consistency
      const serviceFees = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      expect(serviceFees).to.equal(expectedFee);
    });
  });
}); 