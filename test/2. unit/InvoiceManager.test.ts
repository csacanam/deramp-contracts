import { expect } from "chai";
import { ethers } from "hardhat";
import { TestContext } from "../1. setup/test-setup";

describe("InvoiceManager", function () {
    let context: TestContext;
    let proxy: any;
    let invoiceManager: any;
    let mockToken1: any;
    let mockToken2: any;
    let commerce1: any;
    let commerce2: any;
    let user1: any;
    let user2: any;

    beforeEach(async function () {
        context = await (await import("../1. setup/test-setup")).setupTest();
        proxy = context.proxy;
        invoiceManager = context.invoiceManager;
        mockToken1 = context.mockToken1;
        mockToken2 = context.mockToken2;
        commerce1 = context.commerce1;
        commerce2 = context.commerce2;
        user1 = context.user1;
        user2 = context.user2;
    });

    describe("Invoice Creation", function () {
        it("should create invoice successfully with valid parameters", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            
            const paymentOptions = [
                {
                    token: await mockToken1.getAddress(),
                    amount: ethers.parseUnits("100", 6)
                }
            ];

            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.emit(invoiceManager, "InvoiceCreated")
              .withArgs(invoiceId, await commerce1.getAddress());

            // Verify invoice was created
            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice.invoiceId).to.equal(invoiceId);
            expect(invoice.commerce).to.equal(await commerce1.getAddress());
            expect(invoice.status).to.equal(0); // PENDING
            expect(invoice.expiresAt).to.equal(expiresAt);
        });

        it("should fail when creating invoice with duplicate ID", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            // Create first invoice
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            // Try to create duplicate
            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should fail when commerce is not whitelisted", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await user1.getAddress(), // Not whitelisted
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should fail when token is not whitelisted", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await user1.getAddress(), // Not whitelisted token
                amount: ethers.parseUnits("100", 6)
            }];

            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should fail when token is not whitelisted for commerce", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken2.getAddress(), // Not whitelisted for commerce1
                amount: ethers.parseUnits("100", 6)
            }];

            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should fail with zero amount payment option", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: 0 // Invalid amount
            }];

            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should fail with empty payment options", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions: any[] = [];

            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should fail with zero address commerce", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            await expect(
                proxy.createInvoice(
                    invoiceId,
                    ethers.ZeroAddress,
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should allow backend to create invoice", async function () {
            const { backend } = context;
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-backend"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            const paymentOptions = [
                {
                    token: await mockToken1.getAddress(),
                    amount: ethers.parseUnits("100", 6)
                }
            ];
            await expect(
                proxy.connect(backend).createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.emit(invoiceManager, "InvoiceCreated")
             .withArgs(invoiceId, await commerce1.getAddress());
        });

        it("should allow commerce to create invoice", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-commerce"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            const paymentOptions = [
                {
                    token: await mockToken1.getAddress(),
                    amount: ethers.parseUnits("100", 6)
                }
            ];
            await expect(
                proxy.connect(commerce1).createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.emit(invoiceManager, "InvoiceCreated")
             .withArgs(invoiceId, await commerce1.getAddress());
        });

        it("should not allow unauthorized user to create invoice", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-unauth"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            const paymentOptions = [
                {
                    token: await mockToken1.getAddress(),
                    amount: ethers.parseUnits("100", 6)
                }
            ];
            await expect(
                proxy.connect(user1).createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("Not authorized");
        });
    });

    describe("Invoice Management", function () {
        let invoiceId: string;
        let expiresAt: number;

        beforeEach(async function () {
            invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );
        });

        it("should cancel pending invoice successfully", async function () {
            await expect(
                proxy.cancelInvoice(invoiceId)
            ).to.emit(invoiceManager, "InvoiceCancelled")
              .withArgs(invoiceId, await commerce1.getAddress());

            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice.status).to.equal(3); // EXPIRED
            expect(invoice.expiredAt).to.be.gt(0);
        });

        it("should fail to cancel non-existent invoice", async function () {
            const nonExistentId = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));
            
            await expect(
                proxy.cancelInvoice(nonExistentId)
            ).to.be.revertedWith("Invoice not found");
        });

        it("should fail to cancel already cancelled invoice", async function () {
            // Cancel first time
            await proxy.cancelInvoice(invoiceId);

            // Try to cancel again
            await expect(
                proxy.cancelInvoice(invoiceId)
            ).to.be.revertedWith("InvoiceManager call failed");
        });

        it("should allow backend to cancel invoice", async function () {
            await expect(
                proxy.connect(context.backend).cancelInvoice(invoiceId)
            ).to.emit(invoiceManager, "InvoiceCancelled")
              .withArgs(invoiceId, await commerce1.getAddress());

            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice.status).to.equal(3); // EXPIRED
            expect(invoice.expiredAt).to.be.gt(0);
        });

        it("should allow commerce to cancel its own invoice", async function () {
            await expect(
                proxy.connect(commerce1).cancelInvoice(invoiceId)
            ).to.emit(invoiceManager, "InvoiceCancelled")
              .withArgs(invoiceId, await commerce1.getAddress());

            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice.status).to.equal(3); // EXPIRED
            expect(invoice.expiredAt).to.be.gt(0);
        });

        it("should not allow unauthorized user to cancel invoice", async function () {
            await expect(
                proxy.connect(user1).cancelInvoice(invoiceId)
            ).to.be.revertedWith("Not authorized");
        });

        it("should not allow commerce to cancel another commerce invoice", async function () {
            // Create invoice for commerce2
            const invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("invoice-commerce2"));
            const expiresAt2 = Math.floor(Date.now() / 1000) + 3600;
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            await proxy.createInvoice(
                invoiceId2,
                await commerce2.getAddress(),
                paymentOptions,
                expiresAt2
            );

            // Try to cancel from commerce1
            await expect(
                proxy.connect(commerce1).cancelInvoice(invoiceId2)
            ).to.be.revertedWith("Not authorized");
        });
    });

    describe("Invoice Queries", function () {
        let invoiceId1: string;
        let invoiceId2: string;
        let invoiceId3: string;

        beforeEach(async function () {
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            // Create multiple invoices
            invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("invoice-2"));
            invoiceId3 = ethers.keccak256(ethers.toUtf8Bytes("invoice-3"));

            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            await proxy.createInvoice(
                invoiceId1,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            await proxy.createInvoice(
                invoiceId2,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            await proxy.createInvoice(
                invoiceId3,
                await commerce2.getAddress(),
                paymentOptions,
                expiresAt
            );
        });

        it("should get invoice details correctly", async function () {
            const invoice = await invoiceManager.getInvoice(invoiceId1);
            
            expect(invoice.invoiceId).to.equal(invoiceId1);
            expect(invoice.commerce).to.equal(await commerce1.getAddress());
            expect(invoice.status).to.equal(0); // PENDING
            expect(invoice.payer).to.equal(ethers.ZeroAddress);
            expect(invoice.paidToken).to.equal(ethers.ZeroAddress);
            expect(invoice.paidAmount).to.equal(0);
        });

        it("should get invoice payment options correctly", async function () {
            const paymentOptions = await invoiceManager.getInvoicePaymentOptions(invoiceId1);
            
            expect(paymentOptions.length).to.equal(1);
            expect(paymentOptions[0].token).to.equal(await mockToken1.getAddress());
            expect(paymentOptions[0].amount).to.equal(ethers.parseUnits("100", 6));
        });

        it("should get commerce invoices correctly", async function () {
            const commerce1Invoices = await invoiceManager.getCommerceInvoices(await commerce1.getAddress());
            const commerce2Invoices = await invoiceManager.getCommerceInvoices(await commerce2.getAddress());
            
            expect(commerce1Invoices.length).to.equal(2);
            expect(commerce2Invoices.length).to.equal(1);
            expect(commerce1Invoices).to.include(invoiceId1);
            expect(commerce1Invoices).to.include(invoiceId2);
            expect(commerce2Invoices).to.include(invoiceId3);
        });

        it("should get commerce invoice count correctly", async function () {
            const count1 = await invoiceManager.getCommerceInvoiceCount(await commerce1.getAddress());
            const count2 = await invoiceManager.getCommerceInvoiceCount(await commerce2.getAddress());
            
            expect(count1).to.equal(2);
            expect(count2).to.equal(1);
        });

        it("should get commerce invoices by status correctly", async function () {
            // Cancel one invoice to change its status
            await proxy.cancelInvoice(invoiceId1);

            const pendingInvoices = await invoiceManager.getCommerceInvoicesByStatus(
                await commerce1.getAddress(),
                0 // PENDING
            );
            const expiredInvoices = await invoiceManager.getCommerceInvoicesByStatus(
                await commerce1.getAddress(),
                3 // EXPIRED
            );

            expect(pendingInvoices.length).to.equal(1);
            expect(expiredInvoices.length).to.equal(1);
            expect(pendingInvoices[0]).to.equal(invoiceId2);
            expect(expiredInvoices[0]).to.equal(invoiceId1);
        });

        it("should get recent commerce invoices correctly", async function () {
            const recentInvoices = await invoiceManager.getRecentCommerceInvoices(
                await commerce1.getAddress(),
                1
            );

            expect(recentInvoices.length).to.equal(1);
            expect(recentInvoices[0]).to.equal(invoiceId2); // Most recent
        });

        it("should get multiple invoices correctly", async function () {
            const result = await invoiceManager.getMultipleInvoices([invoiceId1, invoiceId2]);
            
            expect(result.ids.length).to.equal(2);
            expect(result.commerces.length).to.equal(2);
            expect(result.ids[0]).to.equal(invoiceId1);
            expect(result.ids[1]).to.equal(invoiceId2);
            expect(result.commerces[0]).to.equal(await commerce1.getAddress());
            expect(result.commerces[1]).to.equal(await commerce1.getAddress());
        });
    });

    describe("Validation Functions", function () {
        let invoiceId: string;

        beforeEach(async function () {
            invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );
        });

        it("should return true for existing invoice", async function () {
            const exists = await invoiceManager.invoiceExists(invoiceId);
            expect(exists).to.be.true;
        });

        it("should return false for non-existing invoice", async function () {
            const nonExistentId = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));
            const exists = await invoiceManager.invoiceExists(nonExistentId);
            expect(exists).to.be.false;
        });

        it("should return true for correct commerce", async function () {
            const isCommerce = await invoiceManager.isInvoiceCommerce(invoiceId, await commerce1.getAddress());
            expect(isCommerce).to.be.true;
        });

        it("should return false for wrong commerce", async function () {
            const isCommerce = await invoiceManager.isInvoiceCommerce(invoiceId, await commerce2.getAddress());
            expect(isCommerce).to.be.false;
        });

        it("should return false for non-existing invoice commerce check", async function () {
            const nonExistentId = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));
            const isCommerce = await invoiceManager.isInvoiceCommerce(nonExistentId, await commerce1.getAddress());
            expect(isCommerce).to.be.false;
        });
    });

    describe("Statistics and Analytics", function () {
        let invoiceId1: string;
        let invoiceId2: string;
        let invoiceId3: string;

        beforeEach(async function () {
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            invoiceId1 = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            invoiceId2 = ethers.keccak256(ethers.toUtf8Bytes("invoice-2"));
            invoiceId3 = ethers.keccak256(ethers.toUtf8Bytes("invoice-3"));

            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            // Create invoices
            await proxy.createInvoice(
                invoiceId1,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            await proxy.createInvoice(
                invoiceId2,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            await proxy.createInvoice(
                invoiceId3,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            // Cancel one invoice
            await proxy.cancelInvoice(invoiceId3);
        });

        it("should get commerce stats correctly", async function () {
            const stats = await invoiceManager.getCommerceStats(await commerce1.getAddress());
            
            expect(stats.totalInvoices).to.equal(3);
            expect(stats.pendingInvoices).to.equal(2);
            expect(stats.expiredInvoices).to.equal(1);
            expect(stats.paidInvoices).to.equal(0);
            expect(stats.refundedInvoices).to.equal(0);
        });

        it("should return empty arrays for commerce with no invoices", async function () {
            const tokens = await invoiceManager.getCommerceTokens(await user1.getAddress());
            const revenueResult = await invoiceManager.getCommerceRevenue(
                await user1.getAddress(),
                await mockToken1.getAddress()
            );
            const allRevenuesResult = await invoiceManager.getCommerceAllRevenues(
                await user1.getAddress()
            );
            const totalRevenue = revenueResult[0];
            const netRevenue = revenueResult[1];
            const allTokens = allRevenuesResult[0];
            const allTotalRevenues = allRevenuesResult[1];
            const allNetRevenues = allRevenuesResult[2];

            expect(tokens.length).to.equal(0);
            expect(totalRevenue).to.equal(0);
            expect(netRevenue).to.equal(0);
            expect(allTokens.length).to.equal(0);
            expect(allTotalRevenues.length).to.equal(0);
            expect(allNetRevenues.length).to.equal(0);
        });

        it("should return empty arrays for commerce with no paid invoices", async function () {
            const tokens = await invoiceManager.getCommerceTokens(await commerce1.getAddress());
            expect(tokens.length).to.equal(0); // No paid invoices yet
        });
    });

    describe("Access Control", function () {
        it("should only allow proxy to create invoices", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            // Try to call directly (should fail)
            await expect(
                invoiceManager.connect(user1).createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.be.revertedWith("Only proxy can call");
        });

        it("should only allow proxy to cancel invoices", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            // Try to cancel directly (should fail)
            await expect(
                invoiceManager.connect(user1).cancelInvoice(invoiceId)
            ).to.be.revertedWith("Only proxy can call");
        });
    });

    describe("Edge Cases", function () {
        it("should handle multiple payment options correctly", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            
            const paymentOptions = [
                {
                    token: await mockToken1.getAddress(),
                    amount: ethers.parseUnits("100", 6)
                },
                {
                    token: await mockToken1.getAddress(), // Same token, different amount
                    amount: ethers.parseUnits("200", 6)
                }
            ];

            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            const storedOptions = await invoiceManager.getInvoicePaymentOptions(invoiceId);
            expect(storedOptions.length).to.equal(2);
            expect(storedOptions[0].amount).to.equal(ethers.parseUnits("100", 6));
            expect(storedOptions[1].amount).to.equal(ethers.parseUnits("200", 6));
        });

        it("should handle expired timestamp correctly", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
            const expiresAt = Math.floor(Date.now() / 1000) - 3600; // Expired 1 hour ago
            
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: ethers.parseUnits("100", 6)
            }];

            // Should still create invoice even with expired timestamp
            await expect(
                proxy.createInvoice(
                    invoiceId,
                    await commerce1.getAddress(),
                    paymentOptions,
                    expiresAt
                )
            ).to.not.be.reverted;

            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice.expiresAt).to.equal(expiresAt);
        });
    });
}); 