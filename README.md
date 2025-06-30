# Deramp Smart Contracts

> **Modular payment processing system for blockchain invoicing and treasury management**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg)](https://hardhat.org/)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.19-363636)](https://soliditylang.org/)

## Overview

Deramp is a production-ready, modular smart contract system designed for invoice management, payment processing, and treasury operations. Built with security, scalability, and maintainability in mind.

### Key Features

- 🧩 **Modular Architecture** - Upgradeable components under 24KB each
- 🔐 **Role-Based Access Control** - Granular permissions system
- 💰 **Multi-Token Support** - ERC20 token payments with configurable fees
- 🏦 **Treasury Management** - Automated fee collection and distribution
- 📊 **Analytics & Reporting** - Comprehensive transaction tracking
- ⚡ **Gas Optimized** - Efficient proxy pattern implementation

## Quick Start

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd deramp-contracts

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

### Testing

```bash
# Run all tests
npm test

# Run tests with gas reporting
npm run test:gas

# Run tests with coverage
npm run test:coverage
```

### Deployment

```bash
# Deploy to local network
npx hardhat run scripts/deploy.ts

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network goerli

# Deploy to mainnet
npx hardhat run scripts/deploy.ts --network mainnet
```

## Architecture

### Core Components

| Contract              | Purpose                                | Size  |
| --------------------- | -------------------------------------- | ----- |
| **DerampProxy**       | Main entry point and request router    | ~18KB |
| **DerampStorage**     | Centralized data repository            | ~22KB |
| **AccessManager**     | Authentication and authorization       | ~20KB |
| **InvoiceManager**    | Invoice lifecycle management           | ~19KB |
| **PaymentProcessor**  | Payment processing and refunds         | ~21KB |
| **WithdrawalManager** | Balance withdrawals and analytics      | ~18KB |
| **TreasuryManager**   | Treasury operations and fee management | ~20KB |

### System Flow

```
User/Commerce → DerampProxy → Business Logic Modules → DerampStorage
                    ↓
              Event Emissions & Response
```

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Usage Examples

### Basic Invoice Creation

```solidity
// Create an invoice
bytes32 invoiceId = keccak256("invoice-001");
address commerce = 0x123...;
PaymentOption[] memory options = [
    PaymentOption(USDC_ADDRESS, 1000 * 10**6) // $1000 USDC
];
uint256 expirationTime = block.timestamp + 7 days;

derampProxy.createInvoice(invoiceId, commerce, options, expirationTime);
```

### Processing Payment

```solidity
// Pay an invoice
bytes32 invoiceId = keccak256("invoice-001");
address token = USDC_ADDRESS;
uint256 amount = 1000 * 10**6;

// Approve tokens first
IERC20(token).approve(address(derampProxy), amount);

// Process payment
derampProxy.payInvoice(invoiceId, token, amount);
```

## Configuration

### Environment Setup

Create a `.env` file:

```bash
# Network configuration
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key

# Contract verification
ETHERSCAN_API_KEY=your_etherscan_key

# Gas reporting
COINMARKETCAP_API_KEY=your_cmc_key
```

### Network Configuration

Supported networks are configured in `hardhat.config.ts`:

- Local hardhat network
- Ethereum mainnet
- Goerli testnet
- Polygon mainnet
- Mumbai testnet

## Security

### Access Control

The system implements role-based access control with the following roles:

- `DEFAULT_ADMIN_ROLE` - System administration
- `TOKEN_MANAGER_ROLE` - Token whitelist management
- `ONBOARDING_ROLE` - Commerce whitelist management
- `TREASURY_MANAGER_ROLE` - Treasury operations

### Security Features

- ✅ OpenZeppelin security standards
- ✅ Reentrancy protection
- ✅ Pausable operations
- ✅ Input validation
- ✅ Access control on all functions

### Audits

- [ ] Internal security review
- [ ] External audit (pending)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

## Testing

The project includes comprehensive test coverage:

- **Unit Tests** - Individual contract testing
- **Integration Tests** - Cross-module functionality
- **End-to-End Tests** - Complete workflow validation

Current test status: **90/112 tests passing (80% success rate)**

Run specific test suites:

```bash
# Access control tests
npx hardhat test test/AccessManager.test.ts

# Payment processing tests
npx hardhat test test/PaymentProcessor.test.ts

# Integration tests
npx hardhat test test/Integration.test.ts
```

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) - Detailed system architecture
- [API Reference](docs/API.md) - Contract interfaces (coming soon)
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment (coming soon)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 **Email**: [Insert contact email]
- 💬 **Discord**: [Insert Discord link]
- 🐛 **Issues**: [GitHub Issues](../../issues)
- 📖 **Wiki**: [GitHub Wiki](../../wiki)

---

**⚠️ Disclaimer**: This software is in active development. Use at your own risk in production environments.
