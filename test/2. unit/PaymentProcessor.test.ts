import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTest, TestContext } from "../1. setup/test-setup";

describe("PaymentProcessor", function () {
    let context: TestContext;
    let { proxy, storage, accessManager, invoiceManager, paymentProcessor, withdrawalManager, treasuryManager, admin, backend, treasury, tokenManager, onboarding, mockToken1, mockToken2, commerce1, commerce2, user1, user2 } = {} as TestContext;

    beforeEach(async function () {
        context = await setupTest();
        ({ proxy, storage, accessManager, invoiceManager, paymentProcessor, withdrawalManager, treasuryManager, admin, backend, treasury, tokenManager, onboarding, mockToken1, mockToken2, commerce1, commerce2, user1, user2 } = context);
    });

    describe("Setup Verification", function () {
        it("should have PaymentProcessor correctly configured", async function () {
            // Verify PaymentProcessor is set in proxy
            const paymentProcessorAddress = await proxy.paymentProcessor();
            expect(paymentProcessorAddress).to.equal(await paymentProcessor.getAddress());
            
            // Verify PaymentProcessor is registered in storage
            const moduleAddress = await storage.modules("PaymentProcessor");
            expect(moduleAddress).to.equal(await paymentProcessor.getAddress());
            
            // Verify PaymentProcessor has correct dependencies
            expect(await paymentProcessor.storageContract()).to.equal(await storage.getAddress());
            expect(await paymentProcessor.accessManager()).to.equal(await accessManager.getAddress());
            expect(await paymentProcessor.proxy()).to.equal(await proxy.getAddress());
        });

        it("should debug payInvoice step by step", async function () {
            // Create a simple invoice
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("debug-invoice"));
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            const paymentAmount = ethers.parseUnits("100", 6);

            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: paymentAmount
            }];

            // Step 1: Verify InvoiceManager is authorized
            const isAuthorized = await storage.authorizedModules(await invoiceManager.getAddress());
            console.log("InvoiceManager authorized:", isAuthorized);

            // Step 2: Create invoice
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            // Step 3: Verify invoice was created in storage
            const invoiceFromStorage = await storage.getInvoice(invoiceId);
            console.log("Invoice from storage:", invoiceFromStorage);
            expect(invoiceFromStorage[0]).to.equal(invoiceId); // id is at index 0

            // Step 4: Verify invoice was created in InvoiceManager
            const invoiceFromManager = await invoiceManager.getInvoice(invoiceId);
            console.log("Invoice from manager:", invoiceFromManager);
            expect(invoiceFromManager[0]).to.equal(invoiceId); // id is at index 0
            expect(invoiceFromManager[5]).to.equal(0n); // status is at index 5

            // Step 5: Verify payment options
            const paymentOptionsFromStorage = await storage.getInvoicePaymentOptions(invoiceId);
            console.log("Payment options from storage:", paymentOptionsFromStorage);
            expect(paymentOptionsFromStorage.length).to.equal(1);
            expect(paymentOptionsFromStorage[0].token).to.equal(await mockToken1.getAddress());
            expect(paymentOptionsFromStorage[0].amount).to.equal(paymentAmount);

            // Step 6: Verify token is whitelisted
            const isTokenWhitelisted = await accessManager.isTokenWhitelisted(await mockToken1.getAddress());
            console.log("Token whitelisted:", isTokenWhitelisted);

            // Step 7: Verify token is whitelisted for commerce
            const isTokenWhitelistedForCommerce = await storage.isTokenWhitelistedForCommerce(
                await commerce1.getAddress(),
                await mockToken1.getAddress()
            );
            console.log("Token whitelisted for commerce:", isTokenWhitelistedForCommerce);

            // Step 7.5: Verify PaymentProcessor is authorized
            const isPaymentProcessorAuthorized = await storage.authorizedModules(await paymentProcessor.getAddress());
            console.log("PaymentProcessor authorized:", isPaymentProcessorAuthorized);

            // Step 8: Mint tokens to user
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Step 8.5: Verify user balance and approval
            const userBalance = await mockToken1.balanceOf(await user1.getAddress());
            console.log("User balance:", userBalance.toString());
            const userAllowance = await mockToken1.allowance(await user1.getAddress(), await proxy.getAddress());
            console.log("User allowance:", userAllowance.toString());

            // Step 9: Try to pay through proxy - expect InvoicePaid event from PaymentProcessor
            await expect(
                proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount)
            ).to.emit(paymentProcessor, "InvoicePaid");
        });
    });

    describe("Invoice Payment", function () {
        let invoiceId: string;
        let expiresAt: number;
        let paymentAmount: bigint;

        beforeEach(async function () {
            invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-payment"));
            expiresAt = Math.floor(Date.now() / 1000) + 3600;
            paymentAmount = ethers.parseUnits("100", 6);

            // Create invoice
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: paymentAmount
            }];

            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            // Mint tokens to user1 for payment
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
        });

        it("should process valid payment successfully", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("test-invoice-1"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            // Create invoice
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user and approve
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Process payment
            await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Verify invoice status - PAID = 1, status is at index 5
            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice[5]).to.equal(1n); // status = PAID

            // Verify commerce balance
            const commerceBalance = await paymentProcessor.getBalance(await commerce1.getAddress(), await mockToken1.getAddress());
            expect(commerceBalance).to.be.gt(0);
        });

        it("should calculate and distribute service fees correctly", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("test-invoice-2"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            // Create invoice
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user and approve
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Process payment
            await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Verify service fee balance
            const serviceFeeBalance = await paymentProcessor.getServiceFeeBalance(await mockToken1.getAddress());
            expect(serviceFeeBalance).to.be.gt(0);

            // Verify commerce balance (should be less than payment amount due to fees)
            const commerceBalance = await paymentProcessor.getBalance(await commerce1.getAddress(), await mockToken1.getAddress());
            expect(commerceBalance).to.be.lt(paymentAmount);
        });

        it("should fail when invoice does not exist", async function () {
            const nonExistentInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));
            
            // The contract uses custom errors, so we expect it to revert but not with a specific message
            await expect(
                proxy.payInvoice(nonExistentInvoiceId, await mockToken1.getAddress(), ethers.parseUnits("100", 6))
            ).to.be.reverted;
        });

        it("should fail when invoice has expired", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("expired-invoice"));
            const expiredAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: ethers.parseUnits("100", 6)
                }],
                expiredAt
            );

            await expect(
                proxy.payInvoice(invoiceId, await mockToken1.getAddress(), ethers.parseUnits("100", 6))
            ).to.be.reverted;
        });

        it("should fail when payment amount is incorrect", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("wrong-amount-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            await expect(
                proxy.payInvoice(invoiceId, await mockToken1.getAddress(), ethers.parseUnits("50", 6))
            ).to.be.reverted;
        });

        it("should fail when token is not a valid payment option", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invalid-token-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            await expect(
                proxy.payInvoice(invoiceId, await mockToken2.getAddress(), paymentAmount)
            ).to.be.reverted;
        });

        it("should fail when invoice is not pending", async function () {
            // Create and pay an invoice first
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("paid-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user and approve
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Pay the invoice
            await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Try to pay again - should fail
            await mockToken1.mint(await user2.getAddress(), paymentAmount);
            await mockToken1.connect(user2).approve(await proxy.getAddress(), paymentAmount);
            
            await expect(
                proxy.connect(user2).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount)
            ).to.be.reverted;
        });

        it("should fail when invoice has expired", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("expired-invoice-2"));
            const expiredAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: ethers.parseUnits("100", 6)
                }],
                expiredAt
            );

            await expect(
                proxy.payInvoice(invoiceId, await mockToken1.getAddress(), ethers.parseUnits("100", 6))
            ).to.be.reverted;
        });

        it("should fail with incorrect payment amount", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("wrong-amount-invoice-2"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            await expect(
                proxy.payInvoice(invoiceId, await mockToken1.getAddress(), ethers.parseUnits("50", 6))
            ).to.be.reverted;
        });

        it("should fail with invalid token", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invalid-token-invoice-2"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            await expect(
                proxy.payInvoice(invoiceId, await mockToken2.getAddress(), paymentAmount)
            ).to.be.reverted;
        });

        it("should fail when token is not whitelisted for commerce", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("unwhitelisted-token-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            // Create invoice with token1 (which is whitelisted)
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Try to pay with token2 (which is not whitelisted for this commerce)
            await expect(
                proxy.payInvoice(invoiceId, await mockToken2.getAddress(), paymentAmount)
            ).to.be.reverted;
        });

        it("should fail when user has insufficient tokens", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("insufficient-tokens-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user but don't approve enough
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount / 2n); // Only approve half

            // Try to pay with insufficient allowance
            await expect(
                proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount)
            ).to.be.revertedWithCustomError(mockToken1, "ERC20InsufficientAllowance");
        });
    });

    describe("Refunds", function () {
        let invoiceId: string;
        let paymentAmount: bigint;

        beforeEach(async function () {
            // Create and pay an invoice for refund testing
            invoiceId = ethers.keccak256(ethers.toUtf8Bytes("refund-test-invoice"));
            paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user and approve
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Pay the invoice
            await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);
        });

        it("should fail refund when commerce has insufficient balance", async function () {
            // The commerce received 98 USDC (after 2% fee) but needs to refund 100 USDC
            // This should fail with "Insufficient balance"
            await expect(
                proxy.connect(backend).refundInvoice(invoiceId)
            ).to.be.revertedWith("Insufficient balance [PP]");
        });

        it("should process refund successfully when commerce has sufficient balance", async function () {
            // Create and pay a second invoice so the commerce has enough balance for a refund
            const secondInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("second-invoice-for-balance"));
            await proxy.createInvoice(
                secondInvoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );
            // Mint tokens to user2 and approve
            await mockToken1.mint(await user2.getAddress(), paymentAmount);
            await mockToken1.connect(user2).approve(await proxy.getAddress(), paymentAmount);
            // Pay the second invoice
            await proxy.connect(user2).payInvoice(secondInvoiceId, await mockToken1.getAddress(), paymentAmount);

            // Ahora el comercio tiene suficiente saldo para hacer el refund del primer invoice
            const commerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
            expect(commerceBalance).to.be.greaterThanOrEqual(paymentAmount);

            // Process refund for the first invoice
            await expect(
                proxy.connect(backend).refundInvoice(invoiceId)
            ).to.not.be.reverted;

            // Verify invoice status was updated to REFUNDED
            const invoice = await storage.getInvoice(invoiceId);
            expect(invoice.status).to.equal(2); // REFUNDED status

            // Verify commerce balance was reduced by the full paid amount
            const newCommerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
            // The final balance should be 196 USDC (two payments) minus 100 USDC (refund) = 96 USDC
            const feePercent = await storage.commerceFees(await commerce1.getAddress()) || await storage.defaultFeePercent();
            const serviceFee = paymentAmount * feePercent / 10000n;
            const expectedBalance = (paymentAmount - serviceFee) * 2n - paymentAmount;
            expect(newCommerceBalance).to.equal(expectedBalance);
        });

        it("should fail when invoice is not found for refund", async function () {
            const nonExistentInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("non-existent-refund"));
            
            await expect(
                proxy.refundInvoice(nonExistentInvoiceId)
            ).to.be.reverted;
        });

        it("should fail when invoice is not paid for refund", async function () {
            const unpaidInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("unpaid-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                unpaidInvoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            await expect(
                proxy.refundInvoice(unpaidInvoiceId)
            ).to.be.reverted;
        });
    });

    describe("Balance Management", function () {
        it("should get balance correctly", async function () {
            const balance = await paymentProcessor.getBalance(await commerce1.getAddress(), await mockToken1.getAddress());
            expect(balance).to.equal(0); // Initial balance should be 0
        });

        it("should get service fee balance correctly", async function () {
            const serviceFeeBalance = await paymentProcessor.getServiceFeeBalance(await mockToken1.getAddress());
            expect(serviceFeeBalance).to.equal(0); // Initial service fee balance should be 0
        });

        it("should get multiple balances correctly", async function () {
            const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
            const balances = await paymentProcessor.getBalances(await commerce1.getAddress(), tokens);
            
            expect(balances.length).to.equal(2);
            expect(balances[0]).to.equal(0); // mockToken1 balance
            expect(balances[1]).to.equal(0); // mockToken2 balance
        });

        it("should get multiple service fee balances correctly", async function () {
            const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
            const serviceFeeBalances = await paymentProcessor.getServiceFeeBalances(tokens);
            
            expect(serviceFeeBalances.length).to.equal(2);
            expect(serviceFeeBalances[0]).to.equal(0); // mockToken1 service fee balance
            expect(serviceFeeBalances[1]).to.equal(0); // mockToken2 service fee balance
        });
    });

    describe("Role-Based Access Control", function () {
        let invoiceId: string;
        let expiresAt: number;
        let paymentAmount: bigint;

        beforeEach(async function () {
            invoiceId = ethers.keccak256(ethers.toUtf8Bytes("invoice-roles"));
            expiresAt = Math.floor(Date.now() / 1000) + 3600;
            paymentAmount = ethers.parseUnits("100", 6);

            // Create invoice
            const paymentOptions = [{
                token: await mockToken1.getAddress(),
                amount: paymentAmount
            }];

            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                paymentOptions,
                expiresAt
            );

            // Mint tokens to user1
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
        });

        it("should allow backend to process payments", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("backend-payment-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to backend and approve
            await mockToken1.mint(await backend.getAddress(), paymentAmount);
            await mockToken1.connect(backend).approve(await proxy.getAddress(), paymentAmount);

            // Backend processes payment on behalf of user
            await proxy.connect(backend).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Verify payment was processed
            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice[5]).to.equal(1n); // status = PAID
        });

        it("should allow commerce to process payments", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("commerce-payment-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to commerce and approve
            await mockToken1.mint(await commerce1.getAddress(), paymentAmount);
            await mockToken1.connect(commerce1).approve(await proxy.getAddress(), paymentAmount);

            // Commerce processes payment on behalf of user
            await proxy.connect(commerce1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Verify payment was processed
            const invoice = await invoiceManager.getInvoice(invoiceId);
            expect(invoice[5]).to.equal(1n); // status = PAID
        });

        it("should allow backend to process refunds", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("backend-refund-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user and approve
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Pay the invoice
            await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Create and pay a second invoice so the commerce has enough balance for refund
            const secondInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("second-invoice-for-backend-refund"));
            await proxy.createInvoice(
                secondInvoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );
            await mockToken1.mint(await user2.getAddress(), paymentAmount);
            await mockToken1.connect(user2).approve(await proxy.getAddress(), paymentAmount);
            await proxy.connect(user2).payInvoice(secondInvoiceId, await mockToken1.getAddress(), paymentAmount);

            // Verify commerce has sufficient balance before refund
            const commerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
            expect(commerceBalance).to.be.greaterThanOrEqual(paymentAmount);

            // Process refund
            await expect(
                proxy.connect(backend).refundInvoice(invoiceId)
            ).to.not.be.reverted;

            // Verify invoice status was updated to REFUNDED
            const invoice = await storage.getInvoice(invoiceId);
            expect(invoice.status).to.equal(2); // REFUNDED status
        });

        it("should allow commerce to process refunds", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("commerce-refund-invoice"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user and approve
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Pay the invoice
            await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Create and pay a second invoice so the commerce has enough balance for refund
            const secondInvoiceId = ethers.keccak256(ethers.toUtf8Bytes("second-invoice-for-commerce-refund"));
            await proxy.createInvoice(
                secondInvoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );
            await mockToken1.mint(await user2.getAddress(), paymentAmount);
            await mockToken1.connect(user2).approve(await proxy.getAddress(), paymentAmount);
            await proxy.connect(user2).payInvoice(secondInvoiceId, await mockToken1.getAddress(), paymentAmount);

            // Verify commerce has sufficient balance before refund
            const commerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
            expect(commerceBalance).to.be.greaterThanOrEqual(paymentAmount);

            // Process refund
            await expect(
                proxy.connect(commerce1).refundInvoice(invoiceId)
            ).to.not.be.reverted;

            // Verify invoice status was updated to REFUNDED
            const invoice = await storage.getInvoice(invoiceId);
            expect(invoice.status).to.equal(2); // REFUNDED status
        });

        it("should fail refund when commerce has insufficient balance", async function () {
            const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("insufficient-balance-refund"));
            const paymentAmount = ethers.parseUnits("100", 6);
            
            await proxy.createInvoice(
                invoiceId,
                await commerce1.getAddress(),
                [{
                    token: await mockToken1.getAddress(),
                    amount: paymentAmount
                }],
                0
            );

            // Mint tokens to user and approve
            await mockToken1.mint(await user1.getAddress(), paymentAmount);
            await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);

            // Pay the invoice (commerce receives 98 USDC after 2% fee)
            await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);

            // Verify commerce has insufficient balance for full refund (needs 100 USDC but only has 98 USDC)
            const commerceBalance = await storage.balances(await commerce1.getAddress(), await mockToken1.getAddress());
            expect(commerceBalance).to.be.lessThan(paymentAmount);

            // Process refund should fail
            await expect(
                proxy.connect(backend).refundInvoice(invoiceId)
            ).to.be.revertedWith("Insufficient balance [PP]");
        });

        it("should allow any user to view balances", async function () {
            // These are view functions, so they should be accessible to anyone
            await expect(
                paymentProcessor.connect(user1).getBalance(await commerce1.getAddress(), await mockToken1.getAddress())
            ).to.not.be.reverted;

            await expect(
                paymentProcessor.connect(user1).getServiceFeeBalance(await mockToken1.getAddress())
            ).to.not.be.reverted;
        });
    });
}); 