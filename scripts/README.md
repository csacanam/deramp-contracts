# Deramp Deployment Scripts

Essential scripts to deploy and configure the Deramp system.

## 🚀 Quick Start (Recommended)

### 1. Edit Configuration

Edit `scripts/config.ts` with your token addresses:

```typescript
export const PRODUCTION_TOKENS = [
  "0xTokenAddress1", // USDC
  "0xTokenAddress2", // USDT
];
```

### 2. Deploy and Setup Everything

```bash
npx hardhat run scripts/deploy.ts --network <network-name>
```

**Done!** Everything is deployed, configured, and ready to use.

## 📋 Available Scripts

### ⭐ `deploy.ts`

**Purpose:** Deploy all contracts and configure production settings in one go.

**What it does:**

- Deploys all contracts (DerampStorage, DerampProxy, all modules)
- Configures contract relationships
- Sets up team roles from `config.ts`
- Whitelists production tokens from `config.ts`
- **Automatically configures treasury wallet as ADMIN_WALLET**
- **Transfers all roles to ADMIN_WALLET and revokes from deployer**
- **Saves deployed addresses to `deployed-addresses/<network>-contract-addresses.json`**

**Usage:**

```bash
npx hardhat run scripts/deploy.ts --network <network-name>
```

### `config.ts` ⭐ **SINGLE CONFIGURATION FILE**

**Purpose:** The only configuration file you need to edit before deployment.

**What to edit:**

- `ADMIN_WALLET`: Set in your `.env` file (will have admin control and all team roles)
- `BACKEND_WALLET`: Optional - Set in your `.env` file (for backend operations, defaults to ADMIN_WALLET)
- `PRODUCTION_TOKENS`: Token addresses to whitelist
- **Treasury wallet is automatically set to ADMIN_WALLET**

## 🌐 Supported Networks

### Test Networks

```bash
# Celo Testnet (Alfajores)
npx hardhat run scripts/deploy.ts --network celoTestnet

# Base Testnet (Goerli)
npx hardhat run scripts/deploy.ts --network baseTestnet

# Polygon Testnet (Mumbai)
npx hardhat run scripts/deploy.ts --network polygonTestnet

# BSC Testnet
npx hardhat run scripts/deploy.ts --network bscTestnet
```

### Production Networks

```bash
# Celo Mainnet
npx hardhat run scripts/deploy.ts --network celo

# Base Mainnet
npx hardhat run scripts/deploy.ts --network base

# Polygon Mainnet
npx hardhat run scripts/deploy.ts --network polygon

# BSC Mainnet
npx hardhat run scripts/deploy.ts --network bsc
```

## 🔧 Environment Variables

Create a `.env` file with the following variables (see `env.example` for complete list):

```env
# Required
PRIVATE_KEY=your_private_key_here  # 64 hex characters (with or without 0x prefix)
ADMIN_WALLET=your_admin_wallet_address_here  # Valid Ethereum address (with or without 0x prefix)

# Optional
BACKEND_WALLET=your_backend_wallet_address_here  # Valid Ethereum address (with or without 0x prefix)

# Optional - Network RPC URLs (have defaults)
CELO_RPC_URL=https://forno.celo.org
CELO_TESTNET_RPC_URL=https://alfajores-forno.celo-testnet.org
BASE_RPC_URL=https://mainnet.base.org
BASE_TESTNET_RPC_URL=https://goerli.base.org
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_TESTNET_RPC_URL=https://rpc-mumbai.maticvigil.com
BSC_RPC_URL=https://bsc-dataseed1.binance.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# Optional - API Keys for contract verification
BASESCAN_API_KEY=your_basescan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
BSCSCAN_API_KEY=your_bscscan_api_key

**Note:** The script validates that `PRIVATE_KEY` and `ADMIN_WALLET` are properly set and formatted before deployment.

## 🔄 Workflow

1. **Edit** `config.ts` with your token addresses
2. **Run** `deploy.ts` once
3. **Done!** Everything is ready

## 🔐 Security Features

- **Deployer wallet becomes disposable** - loses all roles after deployment
- **Admin wallet gets full control** - has all roles and permissions
- **No private key exposure** - admin wallet address only, no private key needed
- **Role-based access control** - different wallets for different functions

## 📊 Deployment Checklist

- [ ] Configure environment variables (copy from `env.example`)
- [ ] Edit `scripts/config.ts` with your token addresses
- [ ] Run deployment: `npx hardhat run scripts/deploy.ts --network <network>`
- [ ] ✅ Contract addresses automatically saved to `deployed-addresses/<network>-contract-addresses.json`
- [ ] ✅ Team roles automatically configured
- [ ] ✅ Production tokens automatically whitelisted
- [ ] ✅ Treasury wallet automatically configured
- [ ] ✅ Deployer roles automatically revoked
- [ ] Run tests to verify functionality
- [ ] Verify contracts on block explorer
- [ ] Set up monitoring and alerts

## 🛡️ Security Best Practices

- **Never share private keys**
- **Use dedicated accounts for deployment**
- **Verify all addresses before executing**
- **Test on test networks first**
- **Keep backups of contract addresses**
- **Use different wallets for different roles**

## 🆘 Troubleshooting

### Common Issues

1. **"PRIVATE_KEY environment variable not set" error**

   - Make sure `PRIVATE_KEY` is set in your `.env` file
   - Copy from `env.example` if needed

2. **"ADMIN_WALLET environment variable not set" error**

   - Make sure `ADMIN_WALLET` is set in your `.env` file
   - Must be a valid Ethereum address

3. **"ADMIN_WALLET must be a valid Ethereum address" error**

   - Check that your `ADMIN_WALLET` is a valid Ethereum address
   - Examples: `0x1234567890123456789012345678901234567890` or `1234567890123456789012345678901234567890`

4. **"BACKEND_WALLET must be a valid Ethereum address" error**

   - Check that your `BACKEND_WALLET` is a valid Ethereum address
   - Examples: `0x1234567890123456789012345678901234567890` or `1234567890123456789012345678901234567890`

4. **"config.ts not found" error**

   - Make sure `scripts/config.ts` exists and is properly formatted

5. **"Not admin" errors**

   - This is expected if deployer already lost roles
   - Make sure you're using `deploy.ts`

6. **Contract addresses not found**

   - Check `deployed-addresses/<network>-contract-addresses.json`
   - Run deployment again if file is missing

7. **Network connection issues**
   - Check your RPC URLs
   - Try using default RPC URLs first
   - Ensure you have internet connection

### Support

For deployment issues, check:

1. Detailed error logs
2. Network configuration
3. Environment variables
4. Dependency versions
5. `config.ts` format
```
