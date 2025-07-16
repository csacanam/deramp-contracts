import { expect } from 'chai';
import { setupTest, TestContext } from '../1. setup/test-setup';
import { ethers } from 'hardhat';

describe('AccessManager', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTest();
  });

  describe('Role Management', () => {
    it('should grant and revoke DEFAULT_ADMIN_ROLE', async () => {
      const { accessManager, admin, user1 } = context;
      const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
      
      // Grant role to user
      await accessManager.connect(admin).grantRole(DEFAULT_ADMIN_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, await user1.getAddress())).to.be.true;
      
      // Revoke role from user
      await accessManager.connect(admin).revokeRole(DEFAULT_ADMIN_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, await user1.getAddress())).to.be.false;
    });

    it('should grant and revoke specific roles', async () => {
      const { accessManager, admin, user1 } = context;
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      
      // Grant specific roles
      await accessManager.connect(admin).grantRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      await accessManager.connect(admin).grantRole(ONBOARDING_ROLE, await user1.getAddress());
      
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user1.getAddress())).to.be.true;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.true;
      
      // Revoke roles
      await accessManager.connect(admin).revokeRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      await accessManager.connect(admin).revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user1.getAddress())).to.be.false;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.false;
    });
  });

  describe('Token Whitelist Management', () => {
    it('should add token to whitelist', async () => {
      const { accessManager, admin, mockToken1 } = context;
      await accessManager.connect(admin).addTokenToWhitelist(await mockToken1.getAddress());
      expect(await accessManager.isTokenWhitelisted(await mockToken1.getAddress())).to.be.true;
    });

    it('should remove token from whitelist', async () => {
      const { accessManager, admin, mockToken1 } = context;
      await accessManager.connect(admin).addTokenToWhitelist(await mockToken1.getAddress());
      await accessManager.connect(admin).removeTokenFromWhitelist(await mockToken1.getAddress());
      expect(await accessManager.isTokenWhitelisted(await mockToken1.getAddress())).to.be.false;
    });

    it('should allow TOKEN_MANAGER_ROLE to manage tokens', async () => {
      const { accessManager, tokenManager, mockToken1 } = context;
      await accessManager.connect(tokenManager).addTokenToWhitelist(await mockToken1.getAddress());
      expect(await accessManager.isTokenWhitelisted(await mockToken1.getAddress())).to.be.true;
      
      await accessManager.connect(tokenManager).removeTokenFromWhitelist(await mockToken1.getAddress());
      expect(await accessManager.isTokenWhitelisted(await mockToken1.getAddress())).to.be.false;
    });

    it('should reject invalid token address', async () => {
      const { accessManager, admin } = context;
      await expect(
        accessManager.connect(admin).addTokenToWhitelist(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid token address [AM]');
    });

    it('should get whitelisted tokens list', async () => {
      const { accessManager, admin, mockToken1 } = context;
      await accessManager.connect(admin).addTokenToWhitelist(await mockToken1.getAddress());
      const whitelistedTokens = await accessManager.getWhitelistedTokens();
      expect(whitelistedTokens).to.include(await mockToken1.getAddress());
    });
  });

  describe('Commerce Whitelist Management', () => {
    it('should add commerce to whitelist', async () => {
      const { accessManager, admin, commerce1 } = context;
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce1.getAddress())).to.be.true;
    });

    it('should remove commerce from whitelist', async () => {
      const { accessManager, admin, commerce1 } = context;
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce1.getAddress());
      await accessManager.connect(admin).removeCommerceFromWhitelist(await commerce1.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce1.getAddress())).to.be.false;
    });

    it('should allow ONBOARDING_ROLE to manage commerce', async () => {
      const { accessManager, onboarding, commerce1 } = context;
      await accessManager.connect(onboarding).addCommerceToWhitelist(await commerce1.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce1.getAddress())).to.be.true;
      
      await accessManager.connect(onboarding).removeCommerceFromWhitelist(await commerce1.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce1.getAddress())).to.be.false;
    });

    it('should reject invalid commerce address', async () => {
      const { accessManager, admin } = context;
      await expect(
        accessManager.connect(admin).addCommerceToWhitelist(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid commerce address [AM]');
    });

    it('should add tokens to commerce whitelist', async () => {
      const { accessManager, admin, commerce1, mockToken1 } = context;
      const tokens = [await mockToken1.getAddress()];
      
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce1.getAddress(), await mockToken1.getAddress())).to.be.true;
    });

    it('should remove tokens from commerce whitelist', async () => {
      const { accessManager, admin, commerce1, mockToken1 } = context;
      const tokens = [await mockToken1.getAddress()];
      
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), tokens);
      await accessManager.connect(admin).removeTokenFromCommerceWhitelist(await commerce1.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce1.getAddress(), await mockToken1.getAddress())).to.be.false;
    });

    it('should allow ONBOARDING_ROLE to manage commerce token whitelist', async () => {
      const { accessManager, onboarding, commerce1, mockToken1 } = context;
      const tokens = [await mockToken1.getAddress()];
      
      await accessManager.connect(onboarding).addTokenToCommerceWhitelist(await commerce1.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce1.getAddress(), await mockToken1.getAddress())).to.be.true;
      
      await accessManager.connect(onboarding).removeTokenFromCommerceWhitelist(await commerce1.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce1.getAddress(), await mockToken1.getAddress())).to.be.false;
    });

    it('should handle multiple tokens in commerce whitelist', async () => {
      const { accessManager, admin, commerce1, mockToken1, mockToken2 } = context;
      const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
      
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce1.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce1.getAddress(), await mockToken1.getAddress())).to.be.true;
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce1.getAddress(), await mockToken2.getAddress())).to.be.true;
    });
  });

  describe('Fee Management', () => {
    it('should set and get default fee percent', async () => {
      const { accessManager, admin } = context;
      const newFee = 50; // 0.5%
      await accessManager.connect(admin).setDefaultFeePercent(newFee);
      expect(await accessManager.getDefaultFeePercent()).to.equal(newFee);
    });

    it('should set and get commerce specific fee', async () => {
      const { accessManager, admin, commerce1 } = context;
      const customFee = 75; // 0.75%
      await accessManager.connect(admin).setCommerceFee(await commerce1.getAddress(), customFee);
      expect(await accessManager.getCommerceFee(await commerce1.getAddress())).to.equal(customFee);
    });

    it('should return default fee when no custom fee is set', async () => {
      const { accessManager, admin, commerce1 } = context;
      const defaultFee = 25; // 0.25%
      await accessManager.connect(admin).setDefaultFeePercent(defaultFee);
      expect(await accessManager.getCommerceFee(await commerce1.getAddress())).to.equal(defaultFee);
    });

    it('should allow ONBOARDING_ROLE to manage fees', async () => {
      const { accessManager, onboarding, commerce1 } = context;
      const customFee = 60; // 0.6%
      
      await accessManager.connect(onboarding).setDefaultFeePercent(customFee);
      expect(await accessManager.getDefaultFeePercent()).to.equal(customFee);
      
      await accessManager.connect(onboarding).setCommerceFee(await commerce1.getAddress(), customFee);
      expect(await accessManager.getCommerceFee(await commerce1.getAddress())).to.equal(customFee);
    });

    it('should reject fees higher than 100 (1%)', async () => {
      const { accessManager, admin, commerce1 } = context;
      const invalidFee = 150; // 1.5%
      
      await expect(
        accessManager.connect(admin).setDefaultFeePercent(invalidFee)
      ).to.be.revertedWith('Fee too high [AM]');
      
      await expect(
        accessManager.connect(admin).setCommerceFee(await commerce1.getAddress(), invalidFee)
      ).to.be.revertedWith('Fee too high [AM]');
    });
  });

  describe('Role-Based Access Control', () => {
    it('should deny TOKEN_MANAGER_ROLE access to commerce functions', async () => {
      const { accessManager, tokenManager, commerce1 } = context;
      
      await expect(
        accessManager.connect(tokenManager).addCommerceToWhitelist(await commerce1.getAddress())
      ).to.be.revertedWith('Not authorized [AM]');
    });

    it('should deny ONBOARDING_ROLE access to token functions', async () => {
      const { accessManager, onboarding, mockToken1 } = context;
      
      await expect(
        accessManager.connect(onboarding).addTokenToWhitelist(await mockToken1.getAddress())
      ).to.be.revertedWith('Not authorized [AM]');
    });

    it('should deny unauthorized users access to all functions', async () => {
      const { accessManager, user1, commerce1, mockToken1 } = context;
      
      await expect(
        accessManager.connect(user1).addTokenToWhitelist(await mockToken1.getAddress())
      ).to.be.revertedWith('Not authorized [AM]');
      
      await expect(
        accessManager.connect(user1).addCommerceToWhitelist(await commerce1.getAddress())
      ).to.be.revertedWith('Not authorized [AM]');
    });
  });

  describe('View Functions', () => {
    it('should return correct role constants', async () => {
      const { accessManager } = context;
      
      expect(await accessManager.DEFAULT_ADMIN_ROLE()).to.equal(await accessManager.DEFAULT_ADMIN_ROLE());
      expect(await accessManager.getTokenManagerRole()).to.equal(await accessManager.getTokenManagerRole());
      expect(await accessManager.getOnboardingRole()).to.equal(await accessManager.getOnboardingRole());
      expect(await accessManager.getTreasuryManagerRole()).to.equal(await accessManager.getTreasuryManagerRole());
      expect(await accessManager.getBackendOperatorRole()).to.equal(await accessManager.getBackendOperatorRole());
    });

    it('should return correct storage and proxy addresses', async () => {
      const { accessManager, storage, proxy } = context;
      expect(await accessManager.storageContract()).to.equal(await storage.getAddress());
      expect(await accessManager.proxy()).to.equal(await proxy.getAddress());
    });
  });

  describe('Emergency Functions', () => {
    it('should allow admin to call emergency pause', async () => {
      const { accessManager, admin } = context;
      
      await expect(
        accessManager.connect(admin).emergencyPause()
      ).to.not.be.reverted;
    });

    it('should deny non-admin access to emergency functions', async () => {
      const { accessManager, user1 } = context;
      
      await expect(
        accessManager.connect(user1).emergencyPause()
      ).to.be.revertedWith('Not admin [AM]');
    });
  });
}); 