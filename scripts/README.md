# Deramp Deployment Scripts

Essential scripts to deploy and configure the Deramp system.

## Available Scripts

### 1. `deploy.ts` - Main Deployment

Deploys all Deramp system contracts in the correct order.

```bash
npx hardhat run scripts/deploy.ts --network <network-name>
```

**What it does:**

- Deploys DerampStorage
- Deploys DerampProxy
- Deploys all modules (AccessManager, InvoiceManager, PaymentProcessor, TreasuryManager, WithdrawalManager)
- Configures contract relationships
- Authorizes modules in storage
- **Automatically updates `scripts/config.ts` with deployed addresses**

### 2. `setup-production.ts` - Production Configuration

Configures the system for production after deployment.

```bash
npx hardhat run scripts/setup-production.ts --network <network-name>
```

**What it does:**

- Assigns roles to team members
- Adds production tokens to whitelist
- Configures treasury wallet
- Verifies security configurations

**⚠️ Important:** Update the addresses in `scripts/config.ts` before running it.

## Deployment Process

### Step 1: Initial Deployment

```bash
npx hardhat run scripts/deploy.ts --network mainnet
```

### Step 2: Configure Addresses

After deployment, update the following in `scripts/config.ts`:

- Team member addresses
- Production token addresses
- Treasury wallet address

### Step 3: Production Configuration

```bash
npx hardhat run scripts/setup-production.ts --network mainnet
```

## Network Configuration

### Test Networks

```bash
# Sepolia
npx hardhat run scripts/deploy.ts --network sepolia

# Goerli
npx hardhat run scripts/deploy.ts --network goerli
```

### Production Networks

```bash
# Ethereum Mainnet
npx hardhat run scripts/deploy.ts --network mainnet

# Polygon
npx hardhat run scripts/deploy.ts --network polygon
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Private keys
PRIVATE_KEY=your_private_key_here

# RPC URLs
MAINNET_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/your-api-key
SEPOLIA_RPC_URL=https://eth-sepolia.alchemyapi.io/v2/your-api-key

# API Keys for verification
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

## hardhat.config.ts Configuration

Make sure your `hardhat.config.ts` includes the necessary networks:

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};

export default config;
```

## Contract Verification

After deployment, you can verify contracts on Etherscan:

```bash
npx hardhat verify --network mainnet <contract-address> [constructor-arguments]
```

## Deployment Checklist

- [ ] Configure environment variables
- [ ] Run initial deployment: `npx hardhat run scripts/deploy.ts --network <network>`
- [ ] ✅ Contract addresses automatically saved to `scripts/config.ts`
- [ ] Update team member addresses in `scripts/config.ts`
- [ ] Add production token addresses in `scripts/config.ts`
- [ ] Configure treasury wallet address in `scripts/config.ts`
- [ ] Run production setup: `npx hardhat run scripts/setup-production.ts --network <network>`
- [ ] Run tests to verify functionality
- [ ] Verify contracts on Etherscan
- [ ] Set up monitoring and alerts

## Security

- Never share private keys
- Use dedicated accounts for deployment
- Verify all addresses before executing
- Test on test networks first
- Keep backups of contract addresses

## Support

For deployment issues, check:

1. Detailed error logs
2. Network configuration
3. Environment variables
4. Dependency versions
