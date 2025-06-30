# Deramp Contracts - Modular System

## Overview
Deramp is a modular smart contract system for invoice management and payments, designed to overcome the 24KB contract size limit while maintaining full functionality.

## Architecture

### Core Modules
- **DerampStorage.sol** - Centralized storage layer
- **AccessManager.sol** - Role-based access control
- **InvoiceManager.sol** - Invoice creation and management
- **PaymentProcessor.sol** - Payment processing and refunds
- **TreasuryManager.sol** - Treasury and service fee management
- **WithdrawalManager.sol** - Withdrawal operations
- **DerampProxy.sol** - Unified interface proxy

## Quick Start

### Installation
```bash
npm install
```

### Compilation
```bash
npx hardhat compile
```

### Deployment
```bash
npx hardhat run scripts/deploy.ts --network <network>
```

### Testing
```bash
npx hardhat test
```

## Features

### ✅ Complete Functionality
- Invoice creation and management
- Multi-token payment processing
- Automated service fee collection
- Commerce withdrawal system
- Treasury management
- Analytics and reporting
- Role-based access control
- Emergency controls

### ✅ Technical Advantages
- **Modular Architecture**: Each module < 24KB (deployable)
- **Upgradeable**: Individual module updates
- **Secure**: Granular access controls
- **Efficient**: Optimized gas usage
- **Maintainable**: Clear separation of concerns

## Contract Addresses

After deployment, update this section with your deployed contract addresses:

```
DerampStorage: 0x...
AccessManager: 0x...
InvoiceManager: 0x...
PaymentProcessor: 0x...
TreasuryManager: 0x...
WithdrawalManager: 0x...
DerampProxy: 0x...
```

## Documentation

- **Architecture Details**: See `backup/docs/` for comprehensive analysis
- **Migration Guide**: Complete migration from monolithic version documented
- **API Reference**: Full interface documentation available

## Security

- Multi-signature requirements for critical operations
- Role-based access control
- Pausable contracts for emergency stops
- Comprehensive input validation
- Reentrancy protection

## License

MIT License - see LICENSE file for details.

## Support

For technical support or questions, please open an issue in this repository.
