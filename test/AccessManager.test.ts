import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessManager, DerampStorage } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AccessManager - Business Flows", function () {
  let accessManager: AccessManager;
  let storage: DerampStorage;
  let owner: HardhatEthersSigner;
  let tokenManager: HardhatEthersSigner;
  let onboardingManager: HardhatEthersSigner;
  let treasuryManager: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;
  let commerce1: HardhatEthersSigner;
  let commerce2: HardhatEthersSigner;

  // Test addresses
  const USDC_ADDRESS = "0xa0b86a33e6441e6c1988c0e6c6c2f0a8e3b0c6d4";
  const USDT_ADDRESS = "0xb1c97a44f7a8e4c5d9f8b7e6c3a2b1d0e9f8c7b6";
  const INVALID_ADDRESS = ethers.ZeroAddress;

  // Role constants
  let TOKEN_MANAGER_ROLE: string;
  let ONBOARDING_ROLE: string;
  let TREASURY_MANAGER_ROLE: string;

  beforeEach(async function () {
    [owner, tokenManager, onboardingManager, treasuryManager, unauthorized, commerce1, commerce2] = 
      await ethers.getSigners();

    // Deploy storage
    const StorageFactory = await ethers.getContractFactory("DerampStorage");
    storage = await StorageFactory.deploy();

    // Deploy AccessManager
    const AccessManagerFactory = await ethers.getContractFactory("AccessManager");
    accessManager = await AccessManagerFactory.deploy(await storage.getAddress());

    // Set AccessManager as module in storage
    await storage.setModule("AccessManager", await accessManager.getAddress());

    // Get role constants
    TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
    ONBOARDING_ROLE = await accessManager.getOnboardingRole();
    TREASURY_MANAGER_ROLE = await accessManager.getTreasuryManagerRole();
  });

  describe("Token Onboarding Flow", function () {
    describe("✅ Successful Token Onboarding", function () {
      it("Should complete token onboarding with correct permissions", async function () {
        // 1. Grant TOKEN_MANAGER_ROLE to user
        await accessManager.grantRole(TOKEN_MANAGER_ROLE, tokenManager.address);

        // 2. Token manager adds USDC to whitelist
        await accessManager.connect(tokenManager).addTokenToWhitelist(USDC_ADDRESS);

        // 3. Verify token is whitelisted and can be used
        expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.true;
        expect(await storage.whitelistedTokens(USDC_ADDRESS)).to.be.true;
      });

      it("Should allow owner to manage tokens directly", async function () {
        // Owner should be able to manage tokens without explicit role grant
        await accessManager.connect(owner).addTokenToWhitelist(USDC_ADDRESS);
        
        expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.true;
        
        // Owner can also remove tokens
        await accessManager.connect(owner).removeTokenFromWhitelist(USDC_ADDRESS);
        expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.false;
      });
    });

    describe("❌ Failed Token Onboarding", function () {
      it("Should reject token onboarding without proper permissions", async function () {
        // Unauthorized user tries to add token
        await expect(
          accessManager.connect(unauthorized).addTokenToWhitelist(USDC_ADDRESS)
        ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");

        // Token should not be whitelisted
        expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.false;
      });

      it("Should reject invalid token addresses", async function () {
        await accessManager.grantRole(TOKEN_MANAGER_ROLE, tokenManager.address);

        // Try to add zero address
        await expect(
          accessManager.connect(tokenManager).addTokenToWhitelist(INVALID_ADDRESS)
        ).to.be.revertedWith("Invalid token address");
      });

      it("Should reject wrong role attempting token management", async function () {
        // Grant ONBOARDING_ROLE instead of TOKEN_MANAGER_ROLE
        await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);

        await expect(
          accessManager.connect(onboardingManager).addTokenToWhitelist(USDC_ADDRESS)
        ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
      });
    });
  });

  describe("Commerce Onboarding Flow", function () {
    describe("✅ Successful Commerce Onboarding", function () {
      it("Should complete commerce onboarding with correct permissions", async function () {
        // 1. Grant ONBOARDING_ROLE to user
        await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);

        // 2. Onboarding manager adds commerce to whitelist
        await accessManager.connect(onboardingManager).addCommerceToWhitelist(commerce1.address);

        // 3. Set custom fee for commerce
        await accessManager.connect(onboardingManager).setCommerceFee(commerce1.address, 75); // 0.75%

        // 4. Verify commerce is properly configured
        expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.true;
        expect(await accessManager.getCommerceFee(commerce1.address)).to.equal(75);
        expect(await storage.whitelistedCommerces(commerce1.address)).to.be.true;
      });

      it("Should use default fee when no custom fee is set", async function () {
        await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);
        
        // Set default fee
        await accessManager.connect(onboardingManager).setDefaultFeePercent(50); // 0.5%
        
        // Add commerce without custom fee
        await accessManager.connect(onboardingManager).addCommerceToWhitelist(commerce1.address);
        
        // Should return default fee
        expect(await accessManager.getCommerceFee(commerce1.address)).to.equal(50);
      });
    });

    describe("❌ Failed Commerce Onboarding", function () {
      it("Should reject commerce onboarding without proper permissions", async function () {
        await expect(
          accessManager.connect(unauthorized).addCommerceToWhitelist(commerce1.address)
        ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");

        expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.false;
      });

      it("Should reject invalid commerce addresses", async function () {
        await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);

        await expect(
          accessManager.connect(onboardingManager).addCommerceToWhitelist(INVALID_ADDRESS)
        ).to.be.revertedWith("Invalid commerce address");
      });

      it("Should reject excessive fees", async function () {
        await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);

        // Try to set fee above 1%
        await expect(
          accessManager.connect(onboardingManager).setDefaultFeePercent(101)
        ).to.be.revertedWith("Fee too high");

        await expect(
          accessManager.connect(onboardingManager).setCommerceFee(commerce1.address, 101)
        ).to.be.revertedWith("Fee too high");
      });

      it("Should reject wrong role attempting commerce management", async function () {
        // Grant TOKEN_MANAGER_ROLE instead of ONBOARDING_ROLE
        await accessManager.grantRole(TOKEN_MANAGER_ROLE, tokenManager.address);

        await expect(
          accessManager.connect(tokenManager).addCommerceToWhitelist(commerce1.address)
        ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
      });
    });
  });

  describe("Role Management Flow", function () {
    describe("✅ Successful Role Management", function () {
      it("Should complete role assignment and usage flow", async function () {
        // 1. Owner grants role
        await accessManager.connect(owner).grantRole(TOKEN_MANAGER_ROLE, tokenManager.address);
        
        // 2. Verify role is granted
        expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, tokenManager.address)).to.be.true;
        
        // 3. User can use role permissions
        await accessManager.connect(tokenManager).addTokenToWhitelist(USDC_ADDRESS);
        expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.true;
        
        // 4. Owner can revoke role
        await accessManager.connect(owner).revokeRole(TOKEN_MANAGER_ROLE, tokenManager.address);
        expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, tokenManager.address)).to.be.false;
        
        // 5. User can no longer use permissions
        await expect(
          accessManager.connect(tokenManager).addTokenToWhitelist(USDT_ADDRESS)
        ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
      });
    });

    describe("❌ Failed Role Management", function () {
      it("Should reject unauthorized role management", async function () {
        await expect(
          accessManager.connect(unauthorized).grantRole(TOKEN_MANAGER_ROLE, tokenManager.address)
        ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");

        await expect(
          accessManager.connect(unauthorized).revokeRole(TOKEN_MANAGER_ROLE, owner.address)
        ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
      });
    });
  });

  describe("Complete Business Flow Integration", function () {
    it("Should complete full system setup flow", async function () {
      // 1. Setup roles
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, tokenManager.address);
      await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);
      
      // 2. Configure system defaults
      await accessManager.connect(onboardingManager).setDefaultFeePercent(100); // 1%
      
      // 3. Onboard tokens
      await accessManager.connect(tokenManager).addTokenToWhitelist(USDC_ADDRESS);
      await accessManager.connect(tokenManager).addTokenToWhitelist(USDT_ADDRESS);
      
      // 4. Onboard commerce with custom fee
      await accessManager.connect(onboardingManager).addCommerceToWhitelist(commerce1.address);
      await accessManager.connect(onboardingManager).setCommerceFee(commerce1.address, 75); // 0.75%
      
      // 5. Onboard second commerce with default fee
      await accessManager.connect(onboardingManager).addCommerceToWhitelist(commerce2.address);
      
      // 6. Verify complete configuration
      expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.true;
      expect(await accessManager.isTokenWhitelisted(USDT_ADDRESS)).to.be.true;
      expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.true;
      expect(await accessManager.isCommerceWhitelisted(commerce2.address)).to.be.true;
      expect(await accessManager.getCommerceFee(commerce1.address)).to.equal(75);
      expect(await accessManager.getCommerceFee(commerce2.address)).to.equal(100); // default
      expect(await accessManager.getDefaultFeePercent()).to.equal(100);
    });

    it("Should maintain state consistency across operations", async function () {
      // Setup initial state
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, tokenManager.address);
      await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);
      await accessManager.connect(tokenManager).addTokenToWhitelist(USDC_ADDRESS);
      await accessManager.connect(onboardingManager).addCommerceToWhitelist(commerce1.address);
      
      // Perform various operations
      await accessManager.connect(onboardingManager).setDefaultFeePercent(50);
      await accessManager.connect(onboardingManager).setCommerceFee(commerce1.address, 25);
      await accessManager.connect(tokenManager).addTokenToWhitelist(USDT_ADDRESS);
      
      // Verify original state is maintained
      expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.true;
      expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.true;
      
      // Verify new state is correct
      expect(await accessManager.isTokenWhitelisted(USDT_ADDRESS)).to.be.true;
      expect(await accessManager.getCommerceFee(commerce1.address)).to.equal(25);
      expect(await accessManager.getDefaultFeePercent()).to.equal(50);
    });
  });

  describe("Edge Cases in Business Flows", function () {
    it("Should handle idempotent operations correctly", async function () {
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, tokenManager.address);
      
      // Adding same token twice should not fail
      await accessManager.connect(tokenManager).addTokenToWhitelist(USDC_ADDRESS);
      await accessManager.connect(tokenManager).addTokenToWhitelist(USDC_ADDRESS);
      expect(await accessManager.isTokenWhitelisted(USDC_ADDRESS)).to.be.true;
      
      // Removing non-existent token should not fail
      await accessManager.connect(tokenManager).removeTokenFromWhitelist(USDT_ADDRESS);
      expect(await accessManager.isTokenWhitelisted(USDT_ADDRESS)).to.be.false;
    });

    it("Should handle boundary fee values correctly", async function () {
      await accessManager.grantRole(ONBOARDING_ROLE, onboardingManager.address);
      
      // Test minimum fee (0%)
      await accessManager.connect(onboardingManager).setDefaultFeePercent(0);
      expect(await accessManager.getDefaultFeePercent()).to.equal(0);
      
      // Test maximum fee (1%)
      await accessManager.connect(onboardingManager).setDefaultFeePercent(100);
      expect(await accessManager.getDefaultFeePercent()).to.equal(100);
      
      // Test above maximum should fail
      await expect(
        accessManager.connect(onboardingManager).setDefaultFeePercent(101)
      ).to.be.revertedWith("Fee too high");
    });
  });
}); 