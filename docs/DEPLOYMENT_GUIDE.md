# Deployment Guide

This guide walks you through the complete deployment process for the Deramp Smart Contract System.

## 📋 Prerequisites

Before starting deployment, ensure you have:

- **Node.js 16+** and npm installed
- **Git** for cloning the repository
- **A wallet** with sufficient funds for deployment
- **Network access** to the target blockchain

## 🚀 Quick Deployment

### 1. Environment Setup

```bash
# Clone the repository
git clone <repository-url>
cd deramp-contracts

# Install dependencies
npm install

# Copy environment template
cp env.example .env
```

### 2. Configure Environment Variables

Edit your `.env` file with the required variables:

```env
# Required - Your deployment wallet
PRIVATE_KEY=your_private_key_here

# Required - Wallet that will receive admin roles
ADMIN_WALLET=your_admin_wallet_address_here

# Optional - Separate wallet for backend operations
BACKEND_WALLET=your_backend_wallet_address_here
```

### 3. Configure Token Addresses

Edit `scripts/config.ts` with your production tokens:

```typescript
export const PRODUCTION_TOKENS = [
  "0xTokenAddress1", // USDC
  "0xTokenAddress2", // USDT
  // Add more tokens as needed
];
```

### 4. Deploy

```bash
# Test on local network first
npx hardhat run scripts/deploy.ts --network hardhat

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network celoTestnet

# Deploy to mainnet
npx hardhat run scripts/deploy.ts --network celo
```

## 📊 Deployment Process

### What Happens During Deployment

1. **Contract Deployment**

   - DerampStorage (centralized data storage)
   - DerampProxy (main entry point)
   - AccessManager (role management)
   - InvoiceManager (invoice handling)
   - PaymentProcessor (payment processing)
   - TreasuryManager (treasury operations)
   - WithdrawalManager (withdrawal handling)

2. **System Configuration**

   - Module registration in storage
   - Proxy configuration with all modules
   - Role assignment to admin wallet
   - Token whitelist setup
   - Treasury wallet configuration

3. **Security Setup**

   - All roles transferred to admin wallet
   - Deployer wallet roles revoked
   - Backend wallet configured (if provided)

4. **Address Storage**
   - All contract addresses saved to JSON file
   - Organized by network in `deployed-addresses/` folder

### Deployment Output

After successful deployment, you'll see:

```
🎉 Deployment and setup to <network> completed successfully!
==========================================
DerampStorage:      0x...
DerampProxy:        0x...
AccessManager:      0x...
InvoiceManager:     0x...
PaymentProcessor:   0x...
TreasuryManager:    0x...
WithdrawalManager:  0x...
==========================================

🔐 Admin wallet: 0x...
📝 Deployer wallet: 0x... (roles revoked)
```

## 🌐 Supported Networks

### Testnets (Recommended for Testing)

| Network        | Command                    | Explorer                                    |
| -------------- | -------------------------- | ------------------------------------------- |
| Celo Alfajores | `--network celoTestnet`    | [Alfajores](https://alfajores.celoscan.io/) |
| Base Goerli    | `--network baseTestnet`    | [Goerli](https://goerli.basescan.org/)      |
| Polygon Mumbai | `--network polygonTestnet` | [Mumbai](https://mumbai.polygonscan.com/)   |
| BSC Testnet    | `--network bscTestnet`     | [BSC Testnet](https://testnet.bscscan.com/) |

### Mainnets (Production)

| Network | Command             | Explorer                                |
| ------- | ------------------- | --------------------------------------- |
| Celo    | `--network celo`    | [CeloScan](https://celoscan.io/)        |
| Base    | `--network base`    | [BaseScan](https://basescan.org/)       |
| Polygon | `--network polygon` | [PolygonScan](https://polygonscan.com/) |
| BSC     | `--network bsc`     | [BSCScan](https://bscscan.com/)         |

## 🔐 Role Management

### Available Roles

- **DEFAULT_ADMIN_ROLE**: Full system control
- **ONBOARDING_ROLE**: Commerce and token whitelist management
- **TOKEN_MANAGER_ROLE**: Token whitelist operations
- **TREASURY_MANAGER_ROLE**: Treasury wallet management
- **BACKEND_OPERATOR_ROLE**: Backend operations

### Role Assignment

During deployment:

- **Admin Wallet**: Receives all roles
- **Backend Wallet**: Receives BACKEND_OPERATOR_ROLE (if configured)
- **Deployer Wallet**: All roles revoked (becomes disposable)

### Post-Deployment Role Management

```solidity
// Grant roles to new addresses
await proxy.grantRole(ONBOARDING_ROLE, newAddress);

// Revoke roles from addresses
await proxy.revokeRole(ONBOARDING_ROLE, oldAddress);

// Check if address has role
const hasRole = await proxy.hasRole(ONBOARDING_ROLE, address);
```

## 📁 Deployed Addresses

### File Location

Deployed addresses are automatically saved to:

```
deployed-addresses/<network>-contract-addresses.json
```

### File Format

```json
{
  "network": "celoTestnet",
  "networkName": "Celo Testnet (Alfajores)",
  "deployedAt": "2024-01-15T10:30:00.000Z",
  "addresses": {
    "proxy": "0x...",
    "accessManager": "0x...",
    "invoiceManager": "0x...",
    "paymentProcessor": "0x...",
    "treasuryManager": "0x...",
    "withdrawalManager": "0x..."
  }
}
```

### Using Deployed Addresses

```javascript
// Load addresses
const addresses = require("./deployed-addresses/celo-contract-addresses.json");

// Connect to proxy
const proxy = await ethers.getContractAt(
  "DerampProxy",
  addresses.addresses.proxy
);

// Connect to specific module
const accessManager = await ethers.getContractAt(
  "AccessManager",
  addresses.addresses.accessManager
);
```

## 🔍 Verification

### Contract Verification

After deployment, verify contracts on block explorers:

1. **Celo**: No API key required
2. **Base**: Requires Basescan API key
3. **Polygon**: Requires Polygonscan API key
4. **BSC**: Requires BSCScan API key

### Verification Commands

```bash
# Verify on Base (example)
npx hardhat verify --network base 0xCONTRACT_ADDRESS

# Verify with constructor arguments
npx hardhat verify --network base 0xCONTRACT_ADDRESS "arg1" "arg2"
```

## 🚨 Troubleshooting

### Common Issues

#### 1. "PRIVATE_KEY not set" error

- Ensure `.env` file exists in project root
- Check that `PRIVATE_KEY` is set correctly
- Remove any quotes or extra spaces

#### 2. "ADMIN_WALLET not set" error

- Set `ADMIN_WALLET` in your `.env` file
- Use valid Ethereum address format (0x...)

#### 3. "Insufficient funds" error

- Ensure your wallet has enough native tokens for gas
- Check network-specific requirements (CELO, ETH, MATIC, BNB)

#### 4. "Network not found" error

- Check `hardhat.config.ts` for network configuration
- Ensure RPC URLs are correct
- Try using default RPC URLs first

#### 5. "Module not authorized" error

- This is expected if deployer already lost roles
- Use admin wallet for operations after deployment

### Gas Estimation Issues

```bash
# Check gas estimation
npx hardhat run scripts/deploy.ts --network celoTestnet --verbose

# Use custom gas limit if needed
npx hardhat run scripts/deploy.ts --network celoTestnet --gas-limit 5000000
```

## 📈 Post-Deployment Checklist

- [ ] Verify all contracts on block explorer
- [ ] Test core functionality with small amounts
- [ ] Configure monitoring and alerting
- [ ] Set up backup admin wallets
- [ ] Document deployed addresses
- [ ] Test emergency pause functionality
- [ ] Verify role assignments
- [ ] Test token whitelist operations

## 🔄 Upgrading

### Module Upgrades

The system supports upgrading individual modules:

1. Deploy new module version
2. Update proxy to point to new module
3. Verify functionality
4. Update documentation

### Full System Upgrade

For major upgrades:

1. Deploy new proxy with updated modules
2. Migrate data if necessary
3. Update frontend/backend integrations
4. Test thoroughly before switching

## 📞 Support

For deployment issues:

1. Check this documentation
2. Review error messages carefully
3. Test on local network first
4. Verify environment variables
5. Check network connectivity

---

**Remember**: Always test on testnets before deploying to mainnet!
