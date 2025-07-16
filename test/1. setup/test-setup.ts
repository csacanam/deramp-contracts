// test/setup/test-setup.ts
import { ethers } from 'hardhat';
import { Signer } from 'ethers';

export interface TestContext {
  proxy: any;
  storage: any;
  accessManager: any;
  invoiceManager: any;
  paymentProcessor: any;
  withdrawalManager: any;
  treasuryManager: any;
  admin: Signer;
  backend: Signer;
  treasury: Signer;
  tokenManager: Signer;
  onboarding: Signer;
  // Additional variables for comprehensive testing
  mockToken1: any;
  mockToken2: any;
  commerce1: Signer;
  commerce2: Signer;
  user1: Signer;
  user2: Signer;
}

export async function setupTest(): Promise<TestContext> {
  const [admin, backend, treasury, tokenManager, onboarding, user1, user2, commerce1, commerce2] = await ethers.getSigners();

  // Deploy mock ERC20 tokens
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const mockToken1 = await MockERC20.deploy('Mock Token 1', 'MTK1', 18);
  const mockToken2 = await MockERC20.deploy('Mock Token 2', 'MTK2', 18);

  // Deploy storage
  const DerampStorage = await ethers.getContractFactory('DerampStorage');
  const storage = await DerampStorage.deploy();

  // Deploy Proxy (must be before managers that need its address)
  const DerampProxy = await ethers.getContractFactory('DerampProxy');
  const proxy = await DerampProxy.deploy();

  // Deploy AccessManager (needs storage and proxy addresses)
  const AccessManager = await ethers.getContractFactory('AccessManager');
  const accessManager = await AccessManager.deploy(
    await storage.getAddress(),
    await proxy.getAddress()
  );

  // Deploy InvoiceManager (needs storage, accessManager, proxy addresses)
  const InvoiceManager = await ethers.getContractFactory('InvoiceManager');
  const invoiceManager = await InvoiceManager.deploy(
    await storage.getAddress(),
    await accessManager.getAddress(),
    await proxy.getAddress()
  );

  // Deploy PaymentProcessor (needs storage, accessManager, proxy addresses)
  const PaymentProcessor = await ethers.getContractFactory('PaymentProcessor');
  const paymentProcessor = await PaymentProcessor.deploy(
    await storage.getAddress(),
    await accessManager.getAddress(),
    await proxy.getAddress()
  );

  // Deploy WithdrawalManager (needs storage, accessManager, proxy addresses)
  const WithdrawalManager = await ethers.getContractFactory('WithdrawalManager');
  const withdrawalManager = await WithdrawalManager.deploy(
    await storage.getAddress(),
    await accessManager.getAddress(),
    await proxy.getAddress()
  );

  // Deploy TreasuryManager (needs storage, accessManager, proxy addresses)
  const TreasuryManager = await ethers.getContractFactory('TreasuryManager');
  const treasuryManager = await TreasuryManager.deploy(
    await storage.getAddress(),
    await accessManager.getAddress(),
    await proxy.getAddress()
  );

  // Set module addresses in proxy
  await proxy.setStorageContract(await storage.getAddress());
  await proxy.setAccessManager(await accessManager.getAddress());
  await proxy.setInvoiceManager(await invoiceManager.getAddress());
  await proxy.setPaymentProcessor(await paymentProcessor.getAddress());
  await proxy.setWithdrawalManager(await withdrawalManager.getAddress());
  await proxy.setTreasuryManager(await treasuryManager.getAddress());

  // Authorize managers in storage
  await storage.setModule("AccessManager", await accessManager.getAddress());
  await storage.setModule("InvoiceManager", await invoiceManager.getAddress());
  await storage.setModule("PaymentProcessor", await paymentProcessor.getAddress());
  await storage.setModule("WithdrawalManager", await withdrawalManager.getAddress());
  await storage.setModule("TreasuryManager", await treasuryManager.getAddress());

  // Setup initial roles and whitelists for tests
  const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
  const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
  const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
  const TREASURY_MANAGER_ROLE = await accessManager.getTreasuryManagerRole();
  const BACKEND_OPERATOR_ROLE = await accessManager.getBackendOperatorRole();

  // Grant specific roles to other addresses for testing
  // Note: Role management is done directly through AccessManager for security
  await accessManager.grantRole(ONBOARDING_ROLE, await onboarding.getAddress());
  await accessManager.grantRole(TOKEN_MANAGER_ROLE, await tokenManager.getAddress());
  await accessManager.grantRole(TREASURY_MANAGER_ROLE, await treasury.getAddress());
  await accessManager.grantRole(BACKEND_OPERATOR_ROLE, await backend.getAddress());
  
  // Note: Whitelist management is done directly through AccessManager for security
  await accessManager.addTokenToWhitelist(await mockToken1.getAddress());
  await accessManager.addTokenToWhitelist(await mockToken2.getAddress());
  
  await accessManager.addCommerceToWhitelist(await commerce1.getAddress());
  await accessManager.addCommerceToWhitelist(await commerce2.getAddress());

  // Add tokens to commerce whitelists
  await accessManager.addTokenToCommerceWhitelist(await commerce1.getAddress(), [await mockToken1.getAddress()]);
  await accessManager.addTokenToCommerceWhitelist(await commerce2.getAddress(), [await mockToken1.getAddress(), await mockToken2.getAddress()]);

  return {
    proxy,
    storage,
    accessManager,
    invoiceManager,
    paymentProcessor,
    withdrawalManager,
    treasuryManager,
    admin,
    backend,
    treasury,
    tokenManager,
    onboarding,
    mockToken1,
    mockToken2,
    commerce1,
    commerce2,
    user1,
    user2,
  };
} 