import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessManager, DerampStorage } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AccessManager", function () {
  let accessManager: AccessManager;
  let storage: DerampStorage;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let commerce1: SignerWithAddress;
  let commerce2: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const ONBOARDING_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ONBOARDING_ROLE"));
  const TOKEN_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_MANAGER_ROLE"));
  const TREASURY_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURY_MANAGER_ROLE"));

  beforeEach(async function () {
    [owner, user1, user2, commerce1, commerce2, unauthorized] = await ethers.getSigners();

    // Deploy storage first
    const DerampStorage = await ethers.getContractFactory("DerampStorage");
    storage = await DerampStorage.deploy();

    // Deploy AccessManager
    const AccessManager = await ethers.getContractFactory("AccessManager");
    accessManager = await AccessManager.deploy(await storage.getAddress());

    // Authorize AccessManager to write to storage
    await storage.setModule("AccessManager", await accessManager.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the correct storage contract", async function () {
      expect(await accessManager.storageContract()).to.equal(await storage.getAddress());
    });

    it("Should grant all roles to deployer", async function () {
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, owner.address)).to.be.true;
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, owner.address)).to.be.true;
      expect(await accessManager.hasRole(TREASURY_MANAGER_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Role Management", function () {
    it("Should grant roles to users", async function () {
      await accessManager.grantRole(ONBOARDING_ROLE, user1.address);
      expect(await accessManager.hasRole(ONBOARDING_ROLE, user1.address)).to.be.true;
    });

    it("Should revoke roles from users", async function () {
      await accessManager.grantRole(ONBOARDING_ROLE, user1.address);
      await accessManager.revokeRole(ONBOARDING_ROLE, user1.address);
      expect(await accessManager.hasRole(ONBOARDING_ROLE, user1.address)).to.be.false;
    });

    it("Should prevent unauthorized role granting", async function () {
      await expect(
        accessManager.connect(unauthorized).grantRole(ONBOARDING_ROLE, user1.address)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });

    it("Should prevent unauthorized role revoking", async function () {
      await accessManager.grantRole(ONBOARDING_ROLE, user1.address);
      
      await expect(
        accessManager.connect(unauthorized).revokeRole(ONBOARDING_ROLE, user1.address)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });

    it("Should check roles correctly", async function () {
      expect(await accessManager.hasRole(ONBOARDING_ROLE, user1.address)).to.be.false;
      
      await accessManager.grantRole(ONBOARDING_ROLE, user1.address);
      expect(await accessManager.hasRole(ONBOARDING_ROLE, user1.address)).to.be.true;
    });
  });

  describe("Token Whitelist Management", function () {
    const tokenAddress = "0x1234567890123456789012345678901234567890";
    const tokenAddress2 = "0x2345678901234567890123456789012345678901";

    it("Should add token to whitelist", async function () {
      await accessManager.addTokenToWhitelist(tokenAddress);
      expect(await accessManager.isTokenWhitelisted(tokenAddress)).to.be.true;
    });

    it("Should remove token from whitelist", async function () {
      await accessManager.addTokenToWhitelist(tokenAddress);
      await accessManager.removeTokenFromWhitelist(tokenAddress);
      expect(await accessManager.isTokenWhitelisted(tokenAddress)).to.be.false;
    });

    it("Should add multiple tokens to whitelist", async function () {
      const tokens = [tokenAddress, tokenAddress2];
      await accessManager.addMultipleTokensToWhitelist(tokens);
      
      expect(await accessManager.isTokenWhitelisted(tokenAddress)).to.be.true;
      expect(await accessManager.isTokenWhitelisted(tokenAddress2)).to.be.true;
    });

    it("Should remove multiple tokens from whitelist", async function () {
      const tokens = [tokenAddress, tokenAddress2];
      await accessManager.addMultipleTokensToWhitelist(tokens);
      await accessManager.removeMultipleTokensFromWhitelist(tokens);
      
      expect(await accessManager.isTokenWhitelisted(tokenAddress)).to.be.false;
      expect(await accessManager.isTokenWhitelisted(tokenAddress2)).to.be.false;
    });

    it("Should prevent unauthorized token whitelist operations", async function () {
      await expect(
        accessManager.connect(unauthorized).addTokenToWhitelist(tokenAddress)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });

    it("Should handle adding already whitelisted token", async function () {
      await accessManager.addTokenToWhitelist(tokenAddress);
      // Should not revert when adding already whitelisted token
      await accessManager.addTokenToWhitelist(tokenAddress);
      expect(await accessManager.isTokenWhitelisted(tokenAddress)).to.be.true;
    });

    it("Should handle removing non-whitelisted token", async function () {
      // Should not revert when removing non-whitelisted token
      await accessManager.removeTokenFromWhitelist(tokenAddress);
      expect(await accessManager.isTokenWhitelisted(tokenAddress)).to.be.false;
    });
  });

  describe("Commerce Whitelist Management", function () {
    it("Should add commerce to whitelist", async function () {
      await accessManager.addCommerceToWhitelist(commerce1.address);
      expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.true;
    });

    it("Should remove commerce from whitelist", async function () {
      await accessManager.addCommerceToWhitelist(commerce1.address);
      await accessManager.removeCommerceFromWhitelist(commerce1.address);
      expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.false;
    });

    it("Should add multiple commerces to whitelist", async function () {
      const commerces = [commerce1.address, commerce2.address];
      await accessManager.addMultipleCommercesToWhitelist(commerces);
      
      expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.true;
      expect(await accessManager.isCommerceWhitelisted(commerce2.address)).to.be.true;
    });

    it("Should remove multiple commerces from whitelist", async function () {
      const commerces = [commerce1.address, commerce2.address];
      await accessManager.addMultipleCommercesToWhitelist(commerces);
      await accessManager.removeMultipleCommercesFromWhitelist(commerces);
      
      expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.false;
      expect(await accessManager.isCommerceWhitelisted(commerce2.address)).to.be.false;
    });

    it("Should prevent unauthorized commerce whitelist operations", async function () {
      await expect(
        accessManager.connect(unauthorized).addCommerceToWhitelist(commerce1.address)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });

    it("Should handle zero address", async function () {
      await expect(
        accessManager.addCommerceToWhitelist(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid commerce address");
    });
  });

  describe("Fee Management", function () {
    it("Should set default fee percent", async function () {
      const newFee = 250; // 2.5%
      await accessManager.setDefaultFeePercent(newFee);
      expect(await accessManager.getDefaultFeePercent()).to.equal(newFee);
    });

    it("Should set commerce-specific fee", async function () {
      const customFee = 150; // 1.5%
      await accessManager.setCommerceFee(commerce1.address, customFee);
      expect(await accessManager.getCommerceFee(commerce1.address)).to.equal(customFee);
    });

    it("Should set multiple commerce fees", async function () {
      const commerces = [commerce1.address, commerce2.address];
      const fees = [150, 200]; // 1.5%, 2%
      
      await accessManager.setMultipleCommerceFees(commerces, fees);
      
      expect(await accessManager.getCommerceFee(commerce1.address)).to.equal(150);
      expect(await accessManager.getCommerceFee(commerce2.address)).to.equal(200);
    });

    it("Should return default fee for commerce without custom fee", async function () {
      const defaultFee = 100; // 1%
      await accessManager.setDefaultFeePercent(defaultFee);
      
      // Commerce without custom fee should return default
      expect(await accessManager.getCommerceFee(commerce1.address)).to.equal(defaultFee);
    });

    it("Should prevent unauthorized fee management", async function () {
      await expect(
        accessManager.connect(unauthorized).setDefaultFeePercent(200)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");

      await expect(
        accessManager.connect(unauthorized).setCommerceFee(commerce1.address, 150)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });

    it("Should validate fee limits", async function () {
      // Test maximum fee (1000 basis points = 10%)
      await expect(
        accessManager.setDefaultFeePercent(1001)
      ).to.be.revertedWith("Fee too high");
    });

    it("Should handle array length mismatch in multiple commerce fees", async function () {
      const commerces = [commerce1.address, commerce2.address];
      const fees = [150]; // Mismatched length
      
      await expect(
        accessManager.setMultipleCommerceFees(commerces, fees)
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("Role-based Access Control", function () {
    it("Should allow token manager to manage tokens", async function () {
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, user1.address);
      
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      await accessManager.connect(user1).addTokenToWhitelist(tokenAddress);
      expect(await accessManager.isTokenWhitelisted(tokenAddress)).to.be.true;
    });

    it("Should allow onboarding role to manage commerces", async function () {
      await accessManager.grantRole(ONBOARDING_ROLE, user1.address);
      
      await accessManager.connect(user1).addCommerceToWhitelist(commerce1.address);
      expect(await accessManager.isCommerceWhitelisted(commerce1.address)).to.be.true;
    });

    it("Should prevent non-token-manager from managing tokens", async function () {
      await accessManager.grantRole(ONBOARDING_ROLE, user1.address); // Wrong role
      
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      await expect(
        accessManager.connect(user1).addTokenToWhitelist(tokenAddress)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });

    it("Should prevent non-onboarding from managing commerces", async function () {
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, user1.address); // Wrong role
      
      await expect(
        accessManager.connect(user1).addCommerceToWhitelist(commerce1.address)
      ).to.be.revertedWithCustomError(accessManager, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Integration with Storage", function () {
    it("Should update storage when managing whitelists", async function () {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      
      await accessManager.addTokenToWhitelist(tokenAddress);
      expect(await storage.whitelistedTokens(tokenAddress)).to.be.true;
      
      await accessManager.removeTokenFromWhitelist(tokenAddress);
      expect(await storage.whitelistedTokens(tokenAddress)).to.be.false;
    });

    it("Should update storage when managing fees", async function () {
      const newFee = 250;
      await accessManager.setDefaultFeePercent(newFee);
      expect(await storage.defaultFeePercent()).to.equal(newFee);
      
      const customFee = 150;
      await accessManager.setCommerceFee(commerce1.address, customFee);
      expect(await storage.commerceFees(commerce1.address)).to.equal(customFee);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle empty arrays in multiple operations", async function () {
      const emptyTokens: string[] = [];
      const emptyCommerces: string[] = [];
      
      // Should not revert with empty arrays
      await accessManager.addMultipleTokensToWhitelist(emptyTokens);
      await accessManager.addMultipleCommercesToWhitelist(emptyCommerces);
    });

    it("Should handle maximum fee value", async function () {
      const maxFee = 1000; // 10%
      await accessManager.setDefaultFeePercent(maxFee);
      expect(await accessManager.getDefaultFeePercent()).to.equal(maxFee);
    });

    it("Should handle zero fee value", async function () {
      await accessManager.setDefaultFeePercent(0);
      expect(await accessManager.getDefaultFeePercent()).to.equal(0);
    });
  });
}); 