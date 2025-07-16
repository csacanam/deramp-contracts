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
      const { accessManager, admin, user } = context;
      const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
      
      // Grant role to user
      await accessManager.connect(admin).grantRole(DEFAULT_ADMIN_ROLE, await user.getAddress());
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, await user.getAddress())).to.be.true;
      
      // Revoke role from user
      await accessManager.connect(admin).revokeRole(DEFAULT_ADMIN_ROLE, await user.getAddress());
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, await user.getAddress())).to.be.false;
    });

    it('should grant and revoke specific roles', async () => {
      const { accessManager, admin, user } = context;
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      
      // Grant specific roles
      await accessManager.connect(admin).grantRole(TOKEN_MANAGER_ROLE, await user.getAddress());
      await accessManager.connect(admin).grantRole(ONBOARDING_ROLE, await user.getAddress());
      
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user.getAddress())).to.be.true;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user.getAddress())).to.be.true;
      
      // Revoke roles
      await accessManager.connect(admin).revokeRole(TOKEN_MANAGER_ROLE, await user.getAddress());
      await accessManager.connect(admin).revokeRole(ONBOARDING_ROLE, await user.getAddress());
      
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user.getAddress())).to.be.false;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user.getAddress())).to.be.false;
    });
  });

  describe('Token Whitelist Management', () => {
    it('should add token to whitelist', async () => {
      const { accessManager, admin, token } = context;
      await accessManager.connect(admin).addTokenToWhitelist(await token.getAddress());
      expect(await accessManager.isTokenWhitelisted(await token.getAddress())).to.be.true;
    });

    it('should remove token from whitelist', async () => {
      const { accessManager, admin, token } = context;
      await accessManager.connect(admin).addTokenToWhitelist(await token.getAddress());
      await accessManager.connect(admin).removeTokenFromWhitelist(await token.getAddress());
      expect(await accessManager.isTokenWhitelisted(await token.getAddress())).to.be.false;
    });

    it('should allow TOKEN_MANAGER_ROLE to manage tokens', async () => {
      const { accessManager, tokenManager, token } = context;
      await accessManager.connect(tokenManager).addTokenToWhitelist(await token.getAddress());
      expect(await accessManager.isTokenWhitelisted(await token.getAddress())).to.be.true;
      
      await accessManager.connect(tokenManager).removeTokenFromWhitelist(await token.getAddress());
      expect(await accessManager.isTokenWhitelisted(await token.getAddress())).to.be.false;
    });

    it('should reject invalid token address', async () => {
      const { accessManager, admin } = context;
      await expect(
        accessManager.connect(admin).addTokenToWhitelist(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid token address');
    });

    it('should get whitelisted tokens list', async () => {
      const { accessManager, admin, token } = context;
      await accessManager.connect(admin).addTokenToWhitelist(await token.getAddress());
      const whitelistedTokens = await accessManager.getWhitelistedTokens();
      expect(whitelistedTokens).to.include(await token.getAddress());
    });
  });

  describe('Commerce Whitelist Management', () => {
    it('should add commerce to whitelist', async () => {
      const { accessManager, admin, commerce } = context;
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce.getAddress())).to.be.true;
    });

    it('should remove commerce from whitelist', async () => {
      const { accessManager, admin, commerce } = context;
      await accessManager.connect(admin).addCommerceToWhitelist(await commerce.getAddress());
      await accessManager.connect(admin).removeCommerceFromWhitelist(await commerce.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce.getAddress())).to.be.false;
    });

    it('should allow ONBOARDING_ROLE to manage commerce', async () => {
      const { accessManager, onboarding, commerce } = context;
      await accessManager.connect(onboarding).addCommerceToWhitelist(await commerce.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce.getAddress())).to.be.true;
      
      await accessManager.connect(onboarding).removeCommerceFromWhitelist(await commerce.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await commerce.getAddress())).to.be.false;
    });

    it('should reject invalid commerce address', async () => {
      const { accessManager, admin } = context;
      await expect(
        accessManager.connect(admin).addCommerceToWhitelist(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid commerce address');
    });

    it('should add tokens to commerce whitelist', async () => {
      const { accessManager, admin, commerce, token } = context;
      const tokens = [await token.getAddress()];
      
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce.getAddress(), await token.getAddress())).to.be.true;
    });

    it('should remove tokens from commerce whitelist', async () => {
      const { accessManager, admin, commerce, token } = context;
      const tokens = [await token.getAddress()];
      
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce.getAddress(), tokens);
      await accessManager.connect(admin).removeTokenFromCommerceWhitelist(await commerce.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce.getAddress(), await token.getAddress())).to.be.false;
    });

    it('should allow ONBOARDING_ROLE to manage commerce token whitelist', async () => {
      const { accessManager, onboarding, commerce, token } = context;
      const tokens = [await token.getAddress()];
      
      await accessManager.connect(onboarding).addTokenToCommerceWhitelist(await commerce.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce.getAddress(), await token.getAddress())).to.be.true;
      
      await accessManager.connect(onboarding).removeTokenFromCommerceWhitelist(await commerce.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce.getAddress(), await token.getAddress())).to.be.false;
    });

    it('should handle multiple tokens in commerce whitelist', async () => {
      const { accessManager, admin, commerce } = context;
      const [token1, token2] = await ethers.getSigners();
      const tokens = [await token1.getAddress(), await token2.getAddress()];
      
      await accessManager.connect(admin).addTokenToCommerceWhitelist(await commerce.getAddress(), tokens);
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce.getAddress(), await token1.getAddress())).to.be.true;
      expect(await accessManager.isTokenWhitelistedForCommerce(await commerce.getAddress(), await token2.getAddress())).to.be.true;
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
      const { accessManager, admin, commerce } = context;
      const customFee = 75; // 0.75%
      await accessManager.connect(admin).setCommerceFee(await commerce.getAddress(), customFee);
      expect(await accessManager.getCommerceFee(await commerce.getAddress())).to.equal(customFee);
    });

    it('should return default fee when no custom fee is set', async () => {
      const { accessManager, admin, commerce } = context;
      const defaultFee = 25; // 0.25%
      await accessManager.connect(admin).setDefaultFeePercent(defaultFee);
      expect(await accessManager.getCommerceFee(await commerce.getAddress())).to.equal(defaultFee);
    });

    it('should allow ONBOARDING_ROLE to manage fees', async () => {
      const { accessManager, onboarding, commerce } = context;
      const customFee = 60; // 0.6%
      
      await accessManager.connect(onboarding).setDefaultFeePercent(customFee);
      expect(await accessManager.getDefaultFeePercent()).to.equal(customFee);
      
      await accessManager.connect(onboarding).setCommerceFee(await commerce.getAddress(), customFee);
      expect(await accessManager.getCommerceFee(await commerce.getAddress())).to.equal(customFee);
    });

    it('should reject fees higher than 100 (1%)', async () => {
      const { accessManager, admin, commerce } = context;
      const invalidFee = 150; // 1.5%
      
      await expect(
        accessManager.connect(admin).setDefaultFeePercent(invalidFee)
      ).to.be.revertedWith('Fee too high');
      
      await expect(
        accessManager.connect(admin).setCommerceFee(await commerce.getAddress(), invalidFee)
      ).to.be.revertedWith('Fee too high');
    });
  });

  describe('Role-Based Access Control', () => {
    it('should deny TOKEN_MANAGER_ROLE access to commerce functions', async () => {
      const { accessManager, tokenManager, commerce } = context;
      
      await expect(
        accessManager.connect(tokenManager).addCommerceToWhitelist(await commerce.getAddress())
      ).to.be.revertedWith('Not authorized');
      
      await expect(
        accessManager.connect(tokenManager).setDefaultFeePercent(50)
      ).to.be.revertedWith('Not authorized');
    });

    it('should deny ONBOARDING_ROLE access to token functions', async () => {
      const { accessManager, onboarding, token } = context;
      
      await expect(
        accessManager.connect(onboarding).addTokenToWhitelist(await token.getAddress())
      ).to.be.revertedWith('Not authorized');
    });

    it('should deny unauthorized users access to all functions', async () => {
      const { accessManager, user, token, commerce } = context;
      
      // Token functions
      await expect(
        accessManager.connect(user).addTokenToWhitelist(await token.getAddress())
      ).to.be.revertedWith('Not authorized');
      
      await expect(
        accessManager.connect(user).removeTokenFromWhitelist(await token.getAddress())
      ).to.be.revertedWith('Not authorized');
      
      // Commerce functions
      await expect(
        accessManager.connect(user).addCommerceToWhitelist(await commerce.getAddress())
      ).to.be.revertedWith('Not authorized');
      
      await expect(
        accessManager.connect(user).setDefaultFeePercent(50)
      ).to.be.revertedWith('Not authorized');
      
      // Role management
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      await expect(
        accessManager.connect(user).grantRole(TOKEN_MANAGER_ROLE, await user.getAddress())
      ).to.be.revertedWith('Not admin');
    });
  });

  describe('View Functions', () => {
    it('should return correct role constants', async () => {
      const { accessManager } = context;
      
      expect(await accessManager.getOnboardingRole()).to.equal(await accessManager.ONBOARDING_ROLE());
      expect(await accessManager.getTokenManagerRole()).to.equal(await accessManager.TOKEN_MANAGER_ROLE());
      expect(await accessManager.getTreasuryManagerRole()).to.equal(await accessManager.TREASURY_MANAGER_ROLE());
      expect(await accessManager.getBackendOperatorRole()).to.equal(await accessManager.BACKEND_OPERATOR_ROLE());
      expect(await accessManager.getDefaultAdminRole()).to.equal(await accessManager.DEFAULT_ADMIN_ROLE());
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
      const { accessManager, user } = context;
      await expect(
        accessManager.connect(user).emergencyPause()
      ).to.be.revertedWith('Not admin');
    });
  });
}); 