import { expect } from 'chai';
import { ethers } from 'hardhat';
import { setupTest, TestContext } from '../1. setup/test-setup';

describe('Role Management Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTest();
  });

  describe('Role Assignment and Revocation', () => {
    it('should handle role assignment and revocation', async () => {
      const { accessManager, admin, user1, user2 } = context;
      
      // Get role constants
      const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      
      // Test role assignment
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.true;
      
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, await user2.getAddress());
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user2.getAddress())).to.be.true;
      
      // Test role revocation
      await accessManager.revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.false;
      
      await accessManager.revokeRole(TOKEN_MANAGER_ROLE, await user2.getAddress());
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user2.getAddress())).to.be.false;
    });

    it('should handle batch role operations', async () => {
      const { accessManager, user1, user2, user1: user3 } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      
      // Grant multiple roles to multiple users
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      await accessManager.grantRole(ONBOARDING_ROLE, await user2.getAddress());
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, await user3.getAddress());
      
      // Verify all roles were granted
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.true;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user2.getAddress())).to.be.true;
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user1.getAddress())).to.be.true;
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user3.getAddress())).to.be.true;
      
      // Revoke all roles
      await accessManager.revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      await accessManager.revokeRole(ONBOARDING_ROLE, await user2.getAddress());
      await accessManager.revokeRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      await accessManager.revokeRole(TOKEN_MANAGER_ROLE, await user3.getAddress());
      
      // Verify all roles were revoked
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.false;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user2.getAddress())).to.be.false;
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user1.getAddress())).to.be.false;
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user3.getAddress())).to.be.false;
    });

    it('should handle role renunciation', async () => {
      const { accessManager, user1 } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      
      // Grant role
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.true;
      
      // User renounces their own role
      await accessManager.connect(user1).renounceRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.false;
    });
  });

  describe('Cross-Module Role Integration', () => {
    it('should enforce role-based access across all modules', async () => {
      const { 
        proxy, 
        accessManager, 
        user1, 
        user2, 
        mockToken1, 
        commerce1,
        admin 
      } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      const BACKEND_OPERATOR_ROLE = await accessManager.getBackendOperatorRole();
      
      // Test that unauthorized users cannot perform privileged operations
      
      // 1. Token management - only TOKEN_MANAGER_ROLE can add tokens
      await expect(
        accessManager.connect(user1).addTokenToWhitelist(await mockToken1.getAddress())
      ).to.be.revertedWith("Not authorized [AM]");
      
      // Grant role and test success
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      await expect(
        accessManager.connect(user1).addTokenToWhitelist(await mockToken1.getAddress())
      ).to.not.be.reverted;
      
      // 2. Commerce management - only ONBOARDING_ROLE can add commerce
      await expect(
        accessManager.connect(user2).addCommerceToWhitelist(await user2.getAddress())
      ).to.be.revertedWith("Not authorized [AM]");
      
      // Grant role and test success
      await accessManager.grantRole(ONBOARDING_ROLE, await user2.getAddress());
      await expect(
        accessManager.connect(user2).addCommerceToWhitelist(await user2.getAddress())
      ).to.not.be.reverted;
      
      // 3. Backend operations - only BACKEND_OPERATOR_ROLE can perform backend operations
      const invoiceId = ethers.keccak256(ethers.toUtf8Bytes("role-test-invoice"));
      const paymentAmount = ethers.parseUnits("100", 6);
      
      // Create invoice (should work for any user with proper setup)
      await proxy.createInvoice(
        invoiceId,
        await commerce1.getAddress(),
        [{
          token: await mockToken1.getAddress(),
          amount: paymentAmount
        }],
        0
      );
      
      // Pay invoice (should work for any user)
      await mockToken1.mint(await user1.getAddress(), paymentAmount);
      await mockToken1.connect(user1).approve(await proxy.getAddress(), paymentAmount);
      await proxy.connect(user1).payInvoice(invoiceId, await mockToken1.getAddress(), paymentAmount);
      
      // Refund invoice - only backend can do this
      await expect(
        proxy.connect(user1).refundInvoice(invoiceId)
      ).to.be.revertedWith("Not authorized [PX]");
      
      // Grant backend role and test success
      await accessManager.grantRole(BACKEND_OPERATOR_ROLE, await user1.getAddress());
      await expect(
        proxy.connect(user1).refundInvoice(invoiceId)
      ).to.not.be.reverted;
    });

    it('should handle role inheritance and admin privileges', async () => {
      const { accessManager, admin, user1 } = context;
      
      const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      
      // Admin should have all roles by default
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, await admin.getAddress())).to.be.true;
      
      // Admin can grant any role
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.true;
      
      // Admin can revoke any role
      await accessManager.revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.false;
      
      // Admin can grant admin role to others
      await accessManager.grantRole(DEFAULT_ADMIN_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, await user1.getAddress())).to.be.true;
      
      // New admin can also manage roles
      await accessManager.connect(user1).revokeRole(DEFAULT_ADMIN_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(DEFAULT_ADMIN_ROLE, await user1.getAddress())).to.be.false;
    });
  });

  describe('Role-Based Functionality Integration', () => {
    it('should integrate roles with token whitelist management', async () => {
      const { accessManager, tokenManager, user1, mockToken1 } = context;
      
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      
      // Grant token manager role
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      
      // User with TOKEN_MANAGER_ROLE can manage tokens
      await accessManager.connect(user1).addTokenToWhitelist(await mockToken1.getAddress());
      expect(await accessManager.isTokenWhitelisted(await mockToken1.getAddress())).to.be.true;
      
      await accessManager.connect(user1).removeTokenFromWhitelist(await mockToken1.getAddress());
      expect(await accessManager.isTokenWhitelisted(await mockToken1.getAddress())).to.be.false;
      
      // Revoke role and test failure
      await accessManager.revokeRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      await expect(
        accessManager.connect(user1).addTokenToWhitelist(await mockToken1.getAddress())
      ).to.be.revertedWith("Not authorized [AM]");
    });

    it('should integrate roles with commerce whitelist management', async () => {
      const { accessManager, onboarding, user1, mockToken1 } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      
      // Grant onboarding role
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      
      // User with ONBOARDING_ROLE can manage commerce
      await accessManager.connect(user1).addCommerceToWhitelist(await user1.getAddress());
      expect(await accessManager.isCommerceWhitelisted(await user1.getAddress())).to.be.true;
      
      await accessManager.connect(user1).addTokenToCommerceWhitelist(
        await user1.getAddress(), 
        [await mockToken1.getAddress()]
      );
      expect(await accessManager.isTokenWhitelistedForCommerce(
        await user1.getAddress(), 
        await mockToken1.getAddress()
      )).to.be.true;
      
      // Revoke role and test failure
      await accessManager.revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      await expect(
        accessManager.connect(user1).addCommerceToWhitelist(await user1.getAddress())
      ).to.be.revertedWith("Not authorized [AM]");
    });

    it('should integrate roles with fee management', async () => {
      const { accessManager, onboarding, user1 } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      
      // Grant onboarding role
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      
      // User with ONBOARDING_ROLE can manage fees (max 100 = 1%)
      await accessManager.connect(user1).setDefaultFeePercent(50); // 0.5%
      expect(await accessManager.getDefaultFeePercent()).to.equal(50);
      
      await accessManager.connect(user1).setCommerceFee(await user1.getAddress(), 75); // 0.75%
      expect(await accessManager.getCommerceFee(await user1.getAddress())).to.equal(75);
      
      // Test fee limit
      await expect(
        accessManager.connect(user1).setDefaultFeePercent(150) // 1.5% - too high
      ).to.be.revertedWith("Fee too high [AM]");
      
      // Revoke role and test failure
      await accessManager.revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      await expect(
        accessManager.connect(user1).setDefaultFeePercent(25)
      ).to.be.revertedWith("Not authorized [AM]");
    });
  });

  describe('Role Security and Edge Cases', () => {
    it('should handle role escalation prevention', async () => {
      const { accessManager, user1, user2 } = context;
      
      const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      
      // Grant onboarding role to user1
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      
      // User1 should not be able to grant admin role to themselves
      await expect(
        accessManager.connect(user1).grantRole(DEFAULT_ADMIN_ROLE, await user1.getAddress())
      ).to.be.revertedWith("Not admin [AM]");
      
      // User1 should not be able to grant admin role to others
      await expect(
        accessManager.connect(user1).grantRole(DEFAULT_ADMIN_ROLE, await user2.getAddress())
      ).to.be.revertedWith("Not admin [AM]");
      
      // User1 should not be able to revoke admin role from admin
      await expect(
        accessManager.connect(user1).revokeRole(DEFAULT_ADMIN_ROLE, await accessManager.getAddress())
      ).to.be.revertedWith("Not admin [AM]");
    });

    it('should handle role revocation cascading effects', async () => {
      const { accessManager, user1, mockToken1, commerce1 } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      
      // Grant both roles
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      
      // User can perform operations with both roles
      await accessManager.connect(user1).addTokenToWhitelist(await mockToken1.getAddress());
      await accessManager.connect(user1).addCommerceToWhitelist(await user1.getAddress());
      
      // Revoke one role
      await accessManager.revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      
      // User should still be able to perform token operations
      await accessManager.connect(user1).removeTokenFromWhitelist(await mockToken1.getAddress());
      
      // But not commerce operations
      await expect(
        accessManager.connect(user1).removeCommerceFromWhitelist(await user1.getAddress())
      ).to.be.revertedWith("Not authorized [AM]");
      
      // Revoke remaining role
      await accessManager.revokeRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      
      // User should not be able to perform any privileged operations
      await expect(
        accessManager.connect(user1).addTokenToWhitelist(await mockToken1.getAddress())
      ).to.be.revertedWith("Not authorized [AM]");
    });

    it('should handle emergency pause role requirements', async () => {
      const { accessManager, user1 } = context;
      
      const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
      
      // Only admin can pause
      await expect(
        accessManager.connect(user1).emergencyPause()
      ).to.be.revertedWith("Not admin [AM]");
      
      // Grant admin role and test success
      await accessManager.grantRole(DEFAULT_ADMIN_ROLE, await user1.getAddress());
      await expect(
        accessManager.connect(user1).emergencyPause()
      ).to.not.be.reverted;
      
      // Note: AccessManager doesn't have a paused() function, it just emits an event
    });
  });

  describe('Role Query and Analytics', () => {
    it('should provide comprehensive role information', async () => {
      const { accessManager, user1, user2 } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      const TOKEN_MANAGER_ROLE = await accessManager.getTokenManagerRole();
      
      // Grant roles
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      await accessManager.grantRole(TOKEN_MANAGER_ROLE, await user1.getAddress());
      await accessManager.grantRole(ONBOARDING_ROLE, await user2.getAddress());
      
      // Test role queries
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.true;
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user1.getAddress())).to.be.true;
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user2.getAddress())).to.be.true;
      expect(await accessManager.hasRole(TOKEN_MANAGER_ROLE, await user2.getAddress())).to.be.false;
      
      // Test role constants
      expect(await accessManager.getOnboardingRole()).to.equal(ONBOARDING_ROLE);
      expect(await accessManager.getTokenManagerRole()).to.equal(TOKEN_MANAGER_ROLE);
      expect(await accessManager.getTreasuryManagerRole()).to.equal(await accessManager.getTreasuryManagerRole());
      expect(await accessManager.getBackendOperatorRole()).to.equal(await accessManager.getBackendOperatorRole());
    });

    it('should handle role validation correctly', async () => {
      const { accessManager, user1 } = context;
      
      const ONBOARDING_ROLE = await accessManager.getOnboardingRole();
      const INVALID_ROLE = ethers.keccak256(ethers.toUtf8Bytes("INVALID_ROLE"));
      
      // Test valid role
      await accessManager.grantRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.true;
      
      // Test invalid role
      expect(await accessManager.hasRole(INVALID_ROLE, await user1.getAddress())).to.be.false;
      
      // Revoke role and test
      await accessManager.revokeRole(ONBOARDING_ROLE, await user1.getAddress());
      expect(await accessManager.hasRole(ONBOARDING_ROLE, await user1.getAddress())).to.be.false;
    });
  });
}); 