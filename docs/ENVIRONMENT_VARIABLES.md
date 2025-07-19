# Environment Variables Documentation

This document explains all environment variables used in the Deramp Contracts project.

## Quick Setup

For a minimal setup, you only need these **2 required variables**:

```env
PRIVATE_KEY=your_private_key_here
ADMIN_WALLET=your_admin_wallet_address_here
```

## Required Variables

### `PRIVATE_KEY`

- **Required**: ✅ Yes
- **Description**: Your wallet's private key for deploying contracts
- **Format**: 64-character hexadecimal string (without 0x prefix)
- **Example**: `1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`
- **Usage**: Used by all networks for deployment

### `ADMIN_WALLET`

- **Required**: ✅ Yes
- **Description**: Address that will receive all admin roles after deployment
- **Format**: Ethereum address (with 0x prefix)
- **Example**: `0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6`
- **Usage**: All roles are transferred to this wallet during deployment

### `BACKEND_WALLET`

- **Required**: ❌ No (Optional)
- **Description**: Address that will receive the BACKEND_OPERATOR_ROLE
- **Format**: Ethereum address (with 0x prefix)
- **Example**: `0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6`
- **Usage**: If set, this wallet gets BACKEND_OPERATOR_ROLE. If not set, ADMIN_WALLET gets this role
- **Default**: Uses ADMIN_WALLET if not provided

## Optional Variables (with defaults)

### RPC URLs

All RPC URLs have default values and are optional. Only set them if you want to use custom RPC endpoints.

#### Celo Networks

```env
CELO_RPC_URL=https://forno.celo.org                    # Default: Celo mainnet
CELO_TESTNET_RPC_URL=https://alfajores-forno.celo-testnet.org  # Default: Alfajores testnet
```

#### Base Networks

```env
BASE_RPC_URL=https://mainnet.base.org                 # Default: Base mainnet
BASE_TESTNET_RPC_URL=https://goerli.base.org          # Default: Base Goerli testnet
```

#### Polygon Networks

```env
POLYGON_RPC_URL=https://polygon-rpc.com               # Default: Polygon mainnet
POLYGON_TESTNET_RPC_URL=https://rpc-mumbai.maticvigil.com  # Default: Mumbai testnet
```

#### BNB Smart Chain Networks

```env
BSC_RPC_URL=https://bsc-dataseed1.binance.org         # Default: BSC mainnet
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545  # Default: BSC testnet
```

## Optional Variables (no defaults)

### API Keys for Contract Verification

These are only needed if you want to verify contracts on block explorers after deployment.

```env
BASESCAN_API_KEY=your_basescan_api_key        # For Base network verification
POLYGONSCAN_API_KEY=your_polygonscan_api_key  # For Polygon network verification
BSCSCAN_API_KEY=your_bscscan_api_key          # For BSC network verification
```

**Note**: Celo doesn't require an API key for verification.

### Development Tools

```env
REPORT_GAS=true  # Enable gas usage reporting during deployment
```

## Network-Specific Considerations

### Celo

- **Chain ID**: 42220 (mainnet), 44787 (testnet)
- **Native Token**: CELO
- **Gas Token**: CELO
- **Verification**: No API key required

### Base

- **Chain ID**: 8453 (mainnet), 84531 (testnet)
- **Native Token**: ETH
- **Gas Token**: ETH
- **Verification**: Requires Basescan API key

### Polygon

- **Chain ID**: 137 (mainnet), 80001 (testnet)
- **Native Token**: MATIC
- **Gas Token**: MATIC
- **Verification**: Requires Polygonscan API key

### BNB Smart Chain

- **Chain ID**: 56 (mainnet), 97 (testnet)
- **Native Token**: BNB
- **Gas Token**: BNB
- **Verification**: Requires BSCScan API key

## Security Best Practices

1. **Never commit your `.env` file** to version control
2. **Use different wallets** for deployment and admin roles
3. **Keep your private key secure** and never share it
4. **Use testnets first** before deploying to mainnet
5. **Verify contract addresses** after deployment

## Example Minimal .env File

```env
# Required
PRIVATE_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
ADMIN_WALLET=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6

# Optional - Backend wallet for backend operations
# BACKEND_WALLET=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6

# Optional - only if you want custom RPC endpoints
# CELO_RPC_URL=https://your-custom-celo-rpc.com
# BASE_RPC_URL=https://your-custom-base-rpc.com

# Optional - only if you want contract verification
# BASESCAN_API_KEY=your_api_key_here
# POLYGONSCAN_API_KEY=your_api_key_here
# BSCSCAN_API_KEY=your_api_key_here

# Optional - development tools
# REPORT_GAS=true
```

## Troubleshooting

### "PRIVATE_KEY not set" error

- Make sure your `.env` file exists in the project root
- Check that `PRIVATE_KEY` is set correctly
- Ensure no extra spaces or quotes around the value

### "ADMIN_WALLET not set" error

- Set the `ADMIN_WALLET` variable in your `.env` file
- Use a valid Ethereum address format (0x...)

### "BACKEND_WALLET must be a valid Ethereum address" error

- Check that your `BACKEND_WALLET` is a valid Ethereum address
- Use format: `0x1234567890123456789012345678901234567890`
- If you don't want to use a separate backend wallet, remove this variable

### Network connection issues

- Check your RPC URLs if using custom endpoints
- Try using the default RPC URLs first
- Ensure you have internet connection

### Gas estimation failures

- Make sure your wallet has enough native tokens for gas
- Check that the RPC endpoint is working
- Try with a smaller gas limit if needed
