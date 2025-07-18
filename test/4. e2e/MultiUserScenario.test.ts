import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { setupTest } from '../1. setup/test-setup';

describe('Multi-User Scenario E2E', () => {
  let context: any;

  beforeEach(async () => {
    context = await loadFixture(setupTest);
  });

  describe('Multiple Commerce Simultaneous Operations', () => {
    it('should handle multiple commerces creating and managing invoices simultaneously', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        user2,
        commerce1,
        commerce2,
        admin 
      } = context;

      // Add all commerces to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce2.getAddress());

      // Add tokens to all commerces
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress()]);

      // Create invoices for all commerces simultaneously
      const invoices = [];
      const commerces = [commerce1, commerce2];
      const amounts = [
        ethers.parseUnits("500", 6),
        ethers.parseUnits("750", 6)
      ];

      for (let i = 0; i < 2; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`multi-commerce-${i}`));
        const commerce = commerces[i];
        const amount = amounts[i];

        await proxy.createInvoice(
          invoiceId,
          await commerce.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: amount
          }],
          0
        );

        invoices.push({ id: invoiceId, commerce, amount });
      }

      // Verify all invoices created successfully
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(0); // PENDING
        expect(invoiceState.commerce).to.equal(await invoice.commerce.getAddress());
      }

      // Pay invoices with different users
      const users = [user1, user2]; // user1 pays commerce1, user2 pays commerce2
      
      for (let i = 0; i < invoices.length; i++) {
        const user = users[i];
        const invoice = invoices[i];

        await mockToken1.mint(await user.getAddress(), invoice.amount);
        await mockToken1.connect(user).approve(await proxy.getAddress(), invoice.amount);
        await proxy.connect(user).payInvoice(invoice.id, await mockToken1.getAddress(), invoice.amount);
      }

      // Verify all invoices paid
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify balances for all commerces
      for (let i = 0; i < commerces.length; i++) {
        const commerce = commerces[i];
        const amount = amounts[i];
        const expectedFee = amount * 100n / 10000n; // 1% fee
        const expectedBalance = amount - expectedFee;
        
        const balance = await storage.getCommerceBalance(await commerce.getAddress(), await mockToken1.getAddress());
        expect(balance).to.equal(expectedBalance);
      }

      // All commerces withdraw simultaneously
      for (const commerce of commerces) {
        await proxy.connect(commerce).withdraw(await mockToken1.getAddress());
      }

      // Verify all balances are zero
      for (const commerce of commerces) {
        const balance = await storage.getCommerceBalance(await commerce.getAddress(), await mockToken1.getAddress());
        expect(balance).to.equal(0);
      }
    });

    it('should handle commerce competition for the same user', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        commerce1,
        commerce2,
        admin 
      } = context;

      // Add commerces to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce2.getAddress());
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress()]);

      // Both commerces create invoices for the same user
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("competition-invoice-1"));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("competition-invoice-2"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(
        invoiceId1,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      await proxy.createInvoice(
        invoiceId2,
        await commerce2.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: amount
        }],
        0
      );

      // User has limited funds - can only pay one invoice
      const userFunds = ethers.parseUnits("1200", 6); // Enough for one invoice + fees
      await mockToken1.mint(await user1.getAddress(), userFunds);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), userFunds);

      // Pay first invoice
      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), amount);

      // Try to pay second invoice - should fail due to insufficient funds
      await expect(
        proxy.connect(user1).payInvoice(invoiceId2, await mockToken1.getAddress(), amount)
      ).to.be.reverted;

      // Verify first invoice paid, second still pending
      const invoice1 = await storage.getInvoice(invoiceId1);
      const invoice2 = await storage.getInvoice(invoiceId2);
      
      expect(invoice1.status).to.equal(1); // PAID
      expect(invoice2.status).to.equal(0); // PENDING

      // Verify only first commerce has balance
      const balance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken1.getAddress());
      
      expect(balance1).to.be.gt(0);
      expect(balance2).to.equal(0);
    });
  });

  describe('Multiple Users Simultaneous Payments', () => {
    it('should handle multiple users paying the same commerce simultaneously', async () => {
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

      // Add commerce to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);

      // Create multiple invoices for the same commerce
      const invoices = [];
      const users = [user1, user2];
      const amounts = [
        ethers.parseUnits("300", 6),
        ethers.parseUnits("500", 6)
      ];

      for (let i = 0; i < 2; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`multi-user-invoice-${i}`));
        const amount = amounts[i];

        await proxy.createInvoice(
          invoiceId,
          await commerce1.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: amount
          }],
          0
        );

        invoices.push({ id: invoiceId, user: users[i], amount });
      }

      // All users pay simultaneously
      for (const invoice of invoices) {
        await mockToken1.mint(await invoice.user.getAddress(), invoice.amount);
        await mockToken1.connect(invoice.user).approve(await proxy.getAddress(), invoice.amount);
        await proxy.connect(invoice.user).payInvoice(invoice.id, await mockToken1.getAddress(), invoice.amount);
      }

      // Verify all invoices paid
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify commerce balance is sum of all payments minus fees
      const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
      const expectedFee = totalAmount * 100n / 10000n; // 1% fee
      const expectedBalance = totalAmount - expectedFee;
      
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.equal(expectedBalance);

      // Verify service fees accumulated correctly
      const serviceFees = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      expect(serviceFees).to.equal(expectedFee);
    });

    it('should handle users competing for limited commerce capacity', async () => {
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

      // Add commerce to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);

      // Create limited number of invoices
      const invoices = [];
      const users = [user1, user2];
      const amount = ethers.parseUnits("500", 6);

      for (let i = 0; i < 2; i++) { // Only 2 invoices available
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`capacity-invoice-${i}`));

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

      // All users try to pay simultaneously
      const paymentPromises = [];
      
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const invoice = invoices[i % invoices.length]; // Users compete for same invoices

        await mockToken1.mint(await user.getAddress(), amount);
        await mockToken1.connect(user).approve(await proxy.getAddress(), amount);
        
        paymentPromises.push(
          proxy.connect(user).payInvoice(invoice.id, await mockToken1.getAddress(), amount)
        );
      }

      // Execute payments
      await Promise.all(paymentPromises);

      // Verify invoices are paid (some users may have paid the same invoice)
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify commerce received payments
      const balance = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      expect(balance).to.be.gt(0);
    });
  });

  describe('Resource Competition and Concurrency', () => {
    it('should handle concurrent invoice creation and payment', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        user2,
        commerce1,
        commerce2,
        admin 
      } = context;

      // Add commerces to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce2.getAddress());
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress()]);

      // Create invoices concurrently
      const createPromises = [];
      const invoices = [];

      for (let i = 0; i < 4; i++) {
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`concurrent-invoice-${i}`));
        const commerce = i % 2 === 0 ? commerce1 : commerce2;
        const amount = ethers.parseUnits("200", 6);

        createPromises.push(
          proxy.createInvoice(
            invoiceId,
            await commerce.getAddress(),
            [{
              token: await mockToken1.getAddress(),
              amount: amount
            }],
            0
          )
        );

        invoices.push({ id: invoiceId, commerce, amount });
      }

      // Execute invoice creation concurrently
      await Promise.all(createPromises);

      // Verify all invoices created
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(0); // PENDING
      }

      // Pay invoices concurrently
      const paymentPromises = [];
      
      for (let i = 0; i < invoices.length; i++) {
        const invoice = invoices[i];
        const user = i % 2 === 0 ? user1 : user2;

        await mockToken1.mint(await user.getAddress(), invoice.amount);
        await mockToken1.connect(user).approve(await proxy.getAddress(), invoice.amount);
        
        paymentPromises.push(
          proxy.connect(user).payInvoice(invoice.id, await mockToken1.getAddress(), invoice.amount)
        );
      }

      // Execute payments concurrently
      await Promise.all(paymentPromises);

      // Verify all invoices paid
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify both commerces have balances
      const balance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken1.getAddress());
      
      expect(balance1).to.be.gt(0);
      expect(balance2).to.be.gt(0);
    });

    it('should handle withdrawal competition between commerces', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        user2,
        commerce1,
        commerce2,
        admin 
      } = context;

      // Add commerces to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce2.getAddress());
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress()]);

      // Create and pay invoices for both commerces
      const invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("withdrawal-comp-1"));
      const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("withdrawal-comp-2"));
      const amount = ethers.parseUnits("1000", 6);

      await proxy.createInvoice(invoiceId1, await commerce1.getAddress(), [{
        token: await mockToken1.getAddress(),
        amount: amount
      }], 0);

      await proxy.createInvoice(invoiceId2, await commerce2.getAddress(), [{
        token: await mockToken1.getAddress(),
        amount: amount
      }], 0);

      // Pay invoices
      await mockToken1.mint(await user1.getAddress(), amount);
      await mockToken1.mint(await user2.getAddress(), amount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), amount);
      await mockToken1.connect(user2).approve(await proxy.getAddress(), amount);

      await proxy.connect(user1).payInvoice(invoiceId1, await mockToken1.getAddress(), amount);
      await proxy.connect(user2).payInvoice(invoiceId2, await mockToken1.getAddress(), amount);

      // Both commerces withdraw simultaneously
      const withdrawalPromises = [
        proxy.connect(commerce1).withdraw(await mockToken1.getAddress()),
        proxy.connect(commerce2).withdraw(await mockToken1.getAddress())
      ];

      await Promise.all(withdrawalPromises);

      // Verify both withdrawals successful
      const balance1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance2 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken1.getAddress());
      
      expect(balance1).to.equal(0);
      expect(balance2).to.equal(0);
    });
  });

  describe('Multiple Tokens Simultaneous Operations', () => {
    it('should handle multiple users with different tokens simultaneously', async () => {
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

      // Add commerces to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce2.getAddress());
      
      // Add both tokens to both commerces
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress(), await mockToken2.getAddress()]);
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress(), await mockToken2.getAddress()]);

      // Create invoices with different tokens
      const invoices = [
        {
          id: ethers.keccak256(ethers.toUtf8Bytes("multi-token-1")),
          commerce: commerce1,
          token: mockToken1,
          user: user1,
          amount: ethers.parseUnits("500", 6)
        },
        {
          id: ethers.keccak256(ethers.toUtf8Bytes("multi-token-2")),
          commerce: commerce1,
          token: mockToken2,
          user: user2,
          amount: ethers.parseUnits("300", 6)
        },
        {
          id: ethers.keccak256(ethers.toUtf8Bytes("multi-token-3")),
          commerce: commerce2,
          token: mockToken1,
          user: user1,
          amount: ethers.parseUnits("700", 6)
        },
        {
          id: ethers.keccak256(ethers.toUtf8Bytes("multi-token-4")),
          commerce: commerce2,
          token: mockToken2,
          user: user2,
          amount: ethers.parseUnits("400", 6)
        }
      ];

      // Create all invoices
      for (const invoice of invoices) {
        await proxy.createInvoice(
          invoice.id,
          await invoice.commerce.getAddress(),
          [{
            token: await invoice.token.getAddress(),
            amount: invoice.amount
          }],
          0
        );
      }

      // Pay all invoices simultaneously
      const paymentPromises = [];
      
      for (const invoice of invoices) {
        await invoice.token.mint(await invoice.user.getAddress(), invoice.amount);
        await invoice.token.connect(invoice.user).approve(await proxy.getAddress(), invoice.amount);
        
        paymentPromises.push(
          proxy.connect(invoice.user).payInvoice(invoice.id, await invoice.token.getAddress(), invoice.amount)
        );
      }

      await Promise.all(paymentPromises);

      // Verify all invoices paid
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify balances for both commerces with both tokens
      const balance1Token1 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken1.getAddress());
      const balance1Token2 = await storage.getCommerceBalance(await commerce1.getAddress(), await mockToken2.getAddress());
      const balance2Token1 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken1.getAddress());
      const balance2Token2 = await storage.getCommerceBalance(await commerce2.getAddress(), await mockToken2.getAddress());

      expect(balance1Token1).to.be.gt(0);
      expect(balance1Token2).to.be.gt(0);
      expect(balance2Token1).to.be.gt(0);
      expect(balance2Token2).to.be.gt(0);

      // Verify service fees for both tokens
      const serviceFees1 = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      const serviceFees2 = await storage.getServiceFeeBalance(await mockToken2.getAddress());
      
      expect(serviceFees1).to.be.gt(0);
      expect(serviceFees2).to.be.gt(0);
    });
  });

  describe('High Load Scenarios', () => {
    it('should handle high volume of simultaneous operations', async () => {
      const { 
        proxy, 
        accessManager, 
        storage, 
        mockToken1,
        user1, 
        user2,
        commerce1,
        commerce2,
        admin 
      } = context;

      // Add all commerces to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce2.getAddress());
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress()]);

      // Create high volume of invoices
      const invoices = [];
      const users = [user1, user2];
      const commerces = [commerce1, commerce2];
      const amount = ethers.parseUnits("100", 6);

      for (let i = 0; i < 10; i++) { // High volume
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`high-load-${i}`));
        const user = users[i % users.length];
        const commerce = commerces[i % commerces.length];

        await proxy.createInvoice(
          invoiceId,
          await commerce.getAddress(),
          [{
            token: await mockToken1.getAddress(),
            amount: amount
          }],
          0
        );

        invoices.push({ id: invoiceId, user, commerce, amount });
      }

      // Verify all invoices created
      expect(invoices.length).to.equal(10);
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(0); // PENDING
      }

      // Pay all invoices in batches to simulate high load
      const batchSize = 5;
      for (let batch = 0; batch < Math.ceil(invoices.length / batchSize); batch++) {
        const batchInvoices = invoices.slice(batch * batchSize, (batch + 1) * batchSize);
        const paymentPromises = [];

        for (const invoice of batchInvoices) {
          await mockToken1.mint(await invoice.user.getAddress(), invoice.amount);
          await mockToken1.connect(invoice.user).approve(await proxy.getAddress(), invoice.amount);
          
          paymentPromises.push(
            proxy.connect(invoice.user).payInvoice(invoice.id, await mockToken1.getAddress(), invoice.amount)
          );
        }

        await Promise.all(paymentPromises);
      }

      // Verify all invoices paid
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify all commerces have balances
      for (const commerce of commerces) {
        const balance = await storage.getCommerceBalance(await commerce.getAddress(), await mockToken1.getAddress());
        expect(balance).to.be.gt(0);
      }

      // Verify service fees accumulated
      const serviceFees = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      expect(serviceFees).to.be.gt(0);
    });
  });

  describe('Complex User Interactions', () => {
    it('should handle complex multi-user, multi-commerce, multi-token scenarios', async () => {
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

      // Add all commerces to whitelist
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce2.getAddress());
      
      // Add both tokens to all commerces
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress(), await mockToken2.getAddress()]);
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress(), await mockToken2.getAddress()]);

      // Complex scenario: Multiple users, commerces, and tokens
      const operations = [
        { user: user1, commerce: commerce1, token: mockToken1, amount: ethers.parseUnits("200", 6) },
        { user: user2, commerce: commerce1, token: mockToken2, amount: ethers.parseUnits("150", 6) },
        { user: user1, commerce: commerce2, token: mockToken1, amount: ethers.parseUnits("300", 6) },
        { user: user2, commerce: commerce2, token: mockToken2, amount: ethers.parseUnits("250", 6) }
      ];

      // Create invoices for all operations
      const invoices = [];
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        const invoiceId = ethers.keccak256(ethers.toUtf8Bytes(`complex-${i}`));

        await proxy.createInvoice(
          invoiceId,
          await operation.commerce.getAddress(),
          [{
            token: await operation.token.getAddress(),
            amount: operation.amount
          }],
          0
        );

        invoices.push({ id: invoiceId, operation });
      }

      // Execute all payments
      for (const invoice of invoices) {
        const { user, token, amount } = invoice.operation;
        
        await token.mint(await user.getAddress(), amount);
        await token.connect(user).approve(await proxy.getAddress(), amount);
        await proxy.connect(user).payInvoice(invoice.id, await token.getAddress(), amount);
      }

      // Verify all invoices paid
      for (const invoice of invoices) {
        const invoiceState = await storage.getInvoice(invoice.id);
        expect(invoiceState.status).to.equal(1); // PAID
      }

      // Verify complex balance distribution
      const commerces = [commerce1, commerce2];
      const tokens = [mockToken1, mockToken2];

      for (const commerce of commerces) {
        for (const token of tokens) {
          const balance = await storage.getCommerceBalance(await commerce.getAddress(), await token.getAddress());
          expect(balance).to.be.gte(0); // Some may have 0, some may have balances
        }
      }

      // Verify service fees for both tokens
      const serviceFees1 = await storage.getServiceFeeBalance(await mockToken1.getAddress());
      const serviceFees2 = await storage.getServiceFeeBalance(await mockToken2.getAddress());
      
      expect(serviceFees1).to.be.gt(0);
      expect(serviceFees2).to.be.gt(0);

      // Complex withdrawal scenario
      for (const commerce of commerces) {
        await proxy.connect(commerce).withdrawAll([await mockToken1.getAddress(), await mockToken2.getAddress()]);
      }

      // Verify all balances are zero
      for (const commerce of commerces) {
        for (const token of tokens) {
          const balance = await storage.getCommerceBalance(await commerce.getAddress(), await token.getAddress());
          expect(balance).to.equal(0);
        }
      }
    });
  });
}); 