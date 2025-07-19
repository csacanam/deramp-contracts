# 📍 Deployed Contract Addresses

This directory contains the deployed contract addresses for different networks.

## 📁 File Structure

Each file follows the naming convention: `<network>-contract-addresses.json`

### Examples:

- `celo-contract-addresses.json` - Celo Mainnet
- `celoTestnet-contract-addresses.json` - Celo Alfajores Testnet
- `base-contract-addresses.json` - Base Mainnet
- `baseTestnet-contract-addresses.json` - Base Goerli Testnet
- `polygon-contract-addresses.json` - Polygon Mainnet
- `polygonTestnet-contract-addresses.json` - Polygon Mumbai Testnet
- `bsc-contract-addresses.json` - BSC Mainnet
- `bscTestnet-contract-addresses.json` - BSC Testnet
- `hardhat-contract-addresses.json` - Local Hardhat Network

## 📋 File Format

Each JSON file contains:

```json
{
  "network": "celoTestnet",
  "networkName": "Celo Alfajores Testnet",
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

## 🔍 How to Use

### For Frontend/Backend Integration:

```javascript
import addresses from "./deployed-addresses/celo-contract-addresses.json";

const proxyAddress = addresses.addresses.proxy;
const accessManagerAddress = addresses.addresses.accessManager;
```

### For Block Explorer Verification:

1. Open the JSON file for your network
2. Copy the contract address you want to verify
3. Paste it in the block explorer (e.g., CeloScan, BaseScan, etc.)

### For Contract Interaction:

```javascript
// Example: Connect to AccessManager
const accessManager = await ethers.getContractAt(
  "AccessManager",
  addresses.addresses.accessManager
);
```

## ⚠️ Important Notes

- **These files are auto-generated** by the deployment script
- **Don't edit them manually** - they will be overwritten on next deployment
- **Always verify addresses** on block explorers before using in production
- **Keep backups** of important deployments
- **Check deployment date** to ensure you're using the latest version

## 🚀 Deployment

These files are automatically created when you run:

```bash
npx hardhat run scripts/deploy.ts --network <network-name>
```

## 📊 Networks Supported

- **Celo**: Mainnet and Alfajores Testnet
- **Base**: Mainnet and Goerli Testnet
- **Polygon**: Mainnet and Mumbai Testnet
- **BSC**: Mainnet and Testnet
- **Local**: Hardhat Network for development
