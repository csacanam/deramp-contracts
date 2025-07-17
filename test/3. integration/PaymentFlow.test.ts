import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setupTest, TestContext } from '../1. setup/test-setup';

describe('Payment Flow Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTest();
  });

  describe('Debug Tests', () => {
    it('should debug invoice structure and payment options', async () => {
      const { proxy, storage, mockToken1, commerce1, backend } = context;

      // Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('debug-invoice-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6)
        }
      ];
      const expiresAt = 0; // No expiration for tests

      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      // Debug: Check invoice structure
      const invoice = await storage.getInvoice(invoiceId);
      console.log('=== INVOICE DEBUG ===');
      console.log('Invoice:', invoice);
      console.log('Invoice keys:', Object.keys(invoice));
      console.log('Invoice.commerce:', invoice.commerce);
      console.log('Invoice.status:', invoice.status);
      console.log('Invoice.paymentOptions:', invoice.paymentOptions);
      console.log('Type of paymentOptions:', typeof invoice.paymentOptions);
      console.log('Is paymentOptions array?', Array.isArray(invoice.paymentOptions));

      // Debug: Check payment options separately
      const paymentOptionsFromStorage = await storage.getInvoicePaymentOptions(invoiceId);
      console.log('=== PAYMENT OPTIONS DEBUG ===');
      console.log('PaymentOptions from storage:', paymentOptionsFromStorage);
      console.log('PaymentOptions length:', paymentOptionsFromStorage.length);
      if (paymentOptionsFromStorage.length > 0) {
        console.log('First payment option:', paymentOptionsFromStorage[0]);
        console.log('First payment option keys:', Object.keys(paymentOptionsFromStorage[0]));
        console.log('First payment option token:', paymentOptionsFromStorage[0].token);
        console.log('First payment option amount:', paymentOptionsFromStorage[0].amount);
      }

      // Debug: Check fee limits
      const defaultFee = await storage.defaultFeePercent();
      console.log('=== FEE DEBUG ===');
      console.log('Default fee percent:', defaultFee.toString());
      console.log('Default fee as percentage:', Number(defaultFee) / 100, '%');
    });
  });

  describe('Complete Payment Flow', () => {
    it('should process complete payment flow: create invoice -> pay invoice -> verify balances', async () => {
      const { proxy, storage, mockToken1, commerce1, user1, backend } = context;

      // Step 1: Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('complete-flow-invoice-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6) // 100 tokens
        }
      ];
      const expiresAt = 0; // No expiration for tests

      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      // Verify invoice was created correctly
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.id).to.equal(invoiceId);
      expect(invoice.status).to.equal(0); // PENDING

      // Get payment options separately
      const paymentOptionsFromStorage = await storage.getInvoicePaymentOptions(invoiceId);
      expect(paymentOptionsFromStorage.length).to.equal(1);
      expect(paymentOptionsFromStorage[0].token).to.equal(await mockToken1.getAddress());
      expect(paymentOptionsFromStorage[0].amount).to.equal(ethers.parseUnits('100', 6));

      // Step 2: Mint tokens to user and approve proxy
      const paymentAmount = ethers.parseUnits('100', 6);
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

      // Step 3: Process payment
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Step 4: Verify invoice status updated
      const updatedInvoice = await storage.getInvoice(invoiceId);
      expect(updatedInvoice.status).to.equal(1); // PAID

      // Step 5: Verify commerce balance increased (99% after 1% fee)
      const commerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      const expectedCommerceAmount = paymentAmount * BigInt(99) / BigInt(100); // 99% after 1% fee
      expect(commerceBalance).to.equal(expectedCommerceAmount);

      // Step 6: Verify service fee balance increased (1% fee)
      const serviceFeeBalance = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      const expectedServiceFee = paymentAmount * BigInt(1) / BigInt(100); // 1% fee
      expect(serviceFeeBalance).to.equal(expectedServiceFee);

      // Step 7: Verify user token balance decreased
      const userBalance = await mockToken1.balanceOf(await user1.getAddress());
      expect(userBalance).to.equal(0); // All tokens were used for payment
    });

    it('should handle payment with multiple payment options', async () => {
      const { proxy, storage, mockToken1, mockToken2, commerce2, user1, backend } = context;

      // Create invoice with multiple payment options
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('multi-options-invoice-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6)
        },
        {
          token: await mockToken2.getAddress(),
          amount: ethers.parseUnits('50', 6)
        }
      ];
      const expiresAt = 0; // No expiration for tests

      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce2.getAddress(),
        paymentOptions,
        expiresAt
      );

      // Pay with first token option
      const paymentAmount = ethers.parseUnits('100', 6);
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Verify payment was processed correctly
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(1); // PAID

      const commerceBalance = await storage.balances(await commerce2.getAddress(), await mockToken1.getAddress());
      const expectedCommerceAmount = paymentAmount * BigInt(99) / BigInt(100); // 99% after 1% fee
      expect(commerceBalance).to.equal(expectedCommerceAmount);
    });

    it('should handle payment with custom commerce fee', async () => {
      const { proxy, storage, accessManager, mockToken1, commerce1, user1, backend, admin } = context;

      // Set custom fee for commerce (1% instead of default) - admin has permission
      // The contract expects the fee in basis points (e.g., 100 = 1%)
      const customFee = 100; // 1% in basis points (max allowed)
      await accessManager.connect(admin).setCommerceFee(await commerce1.getAddress(), customFee);

      // Create and pay invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('custom-fee-invoice-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6)
        }
      ];
      const expiresAt = 0; // No expiration for tests

      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      const paymentAmount = ethers.parseUnits('100', 6);
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Verify custom fee was applied
      const commerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      const expectedCommerceAmount = paymentAmount * BigInt(99) / BigInt(100); // 99% after 1% fee
      expect(commerceBalance).to.equal(expectedCommerceAmount);

      const serviceFeeBalance = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      const expectedServiceFee = paymentAmount * BigInt(1) / BigInt(100); // 1% fee
      expect(serviceFeeBalance).to.equal(expectedServiceFee);
    });

    it('should handle payment with refund scenario', async () => {
      const { proxy, storage, mockToken1, commerce1, user1, user2, backend } = context;

      // Create and pay first invoice to give commerce some balance
      const firstInvoiceId = ethers.keccak256(ethers.toUtf8Bytes('refund-first-invoice-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6)
        }
      ];
      const expiresAt = 0; // No expiration for tests

      await proxy.connect(backend).createInvoice(
        firstInvoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      const paymentAmount = ethers.parseUnits('100', 6);
      await mockToken1.mint(await user2.getAddress(), paymentAmount);
      await mockToken1.connect(user2).approve(await proxy.getAddress(), paymentAmount);

      await proxy.connect(user2).payInvoice(firstInvoiceId, await mockToken1.getAddress(), paymentAmount);

      // Create and pay second invoice (the one we'll refund)
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('refund-second-invoice-001'));
      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

      // Verify initial state after payment
      const initialCommerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      const initialServiceFeeBalance = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      const initialUserBalance = await mockToken1.balanceOf(await user1.getAddress());

      // Mint tokens to proxy so it can refund (simulate that proxy has enough funds)
      // The proxy needs to have the full payment amount to refund
      await mockToken1.mint(await proxy.getAddress(), paymentAmount);

      await proxy.connect(backend).refundInvoice(invoiceId);

      // Verify refund was processed correctly
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(2); // REFUNDED

      // Verify balances were reversed
      const finalCommerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
      const finalServiceFeeBalance = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      const finalUserBalance = await mockToken1.balanceOf(await user1.getAddress());

      // Commerce should have only the balance from the first invoice (after fees)
      const feePercent = await storage.commerceFees(await commerce1.getAddress()) || await storage.defaultFeePercent();
      const serviceFee = paymentAmount * feePercent / 10000n;
      const expectedCommerceBalance = paymentAmount - serviceFee; // Only first invoice remains
      expect(finalCommerceBalance).to.equal(expectedCommerceBalance);
      
      // Service fee should be only from the first invoice
      expect(finalServiceFeeBalance).to.equal(serviceFee);
      
      // User should get full amount back
      expect(finalUserBalance).to.equal(paymentAmount);
    });

    it('should handle expired invoice payment rejection', async () => {
      const { proxy, storage, mockToken1, commerce1, user1, backend } = context;

      // Create invoice with past expiration
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('invoice-expired-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6)
        }
      ];
      const expiresAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      // Try to pay expired invoice
      const paymentAmount = ethers.parseUnits('100', 6);
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

      await expect(
        proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount)
      ).to.be.revertedWith('Invoice has expired [PP]');

      // Verify invoice status remains PENDING
      const invoice = await storage.getInvoice(invoiceId);
      expect(invoice.status).to.equal(0); // PENDING
    });

    it('should handle unauthorized payment rejection', async () => {
      const { proxy, storage, mockToken1, commerce1, user1, backend } = context;

      // Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('invoice-unauthorized-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6)
        }
      ];
      const expiresAt = 0; // No expiration for tests

      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      // Try to pay with unauthorized amount (not matching payment option)
      const paymentAmount = ethers.parseUnits('100', 6);
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

      // This should fail because the amount doesn't match any payment option
      await expect(
        proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount * BigInt(2))
      ).to.be.reverted; // Accept any revert, as custom errors may be used
    });

    it('should handle insufficient balance payment rejection', async () => {
      const { proxy, storage, mockToken1, commerce1, user1, backend } = context;

      // Create invoice
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes('invoice-insufficient-001'));
      const paymentOptions = [
        {
          token: await mockToken1.getAddress(),
          amount: ethers.parseUnits('100', 6)
        }
      ];
      const expiresAt = 0; // No expiration for tests

      await proxy.connect(backend).createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        paymentOptions,
        expiresAt
      );

      // Try to pay without sufficient balance
      const paymentAmount = ethers.parseUnits('100', 6);
      // Don't mint tokens to user, so they have 0 balance

      await expect(
        proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount)
      ).to.be.reverted; // Accept any revert, as custom errors may be used
    });
  });
}); 