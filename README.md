# Deramp - Modular Smart Contract System

A comprehensive, modular smart contract system for payment processing, invoice management, and treasury operations built on Ethereum.

## 🏗️ Architecture

Deramp is built with a modular architecture that separates concerns and enables easy upgrades.

### Core Components

- **DerampProxy**: Main entry point that delegates calls to specialized modules
- **DerampStorage**: Centralized storage contract for all system data
- **AccessManager**: Role-based access control and whitelist management

### Key Features

- ✅ **Modular Design**: Easy to upgrade individual components
- ✅ **Role-Based Access Control**: Granular permissions for different operations
- ✅ **Multi-Token Support**: Support for any ERC20 token
- ✅ **Comprehensive Testing**: 198+ tests covering all scenarios

## 🚀 Quick Start

### Installation

```bash
git clone <repository-url>
cd deramp-contracts
npm install
```

### Testing

```bash
# Run all tests
npx hardhat test
```

### Deployment

```bash
# Deploy to local hardhat network
npx hardhat run scripts/deploy.ts --network hardhat
```

## 📋 Test Coverage

The system includes comprehensive test coverage:

- **172 Unit Tests**: Individual module functionality
- **26 E2E Tests**: Complete user workflows and edge cases

## 📁 Scripts

### Available Scripts

- **`scripts/deploy.ts`**: Complete system deployment
- **`scripts/setup-production.ts`**: Production configuration
- **`scripts/README.md`**: Detailed deployment documentation

## 🔐 Security Features

### Access Control

- **DEFAULT_ADMIN_ROLE**: Full system control
- **ONBOARDING_ROLE**: Commerce and token whitelist management
- **TOKEN_MANAGER_ROLE**: Token whitelist operations
- **TREASURY_MANAGER_ROLE**: Treasury wallet management
- **BACKEND_OPERATOR_ROLE**: Backend operations

## 📚 Documentation

### Additional Resources

- **`docs/ARCHITECTURE.md`**: Detailed architecture documentation
- **`scripts/README.md`**: Deployment and configuration guide
- **Contract Comments**: Inline documentation in all contracts

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Deramp** - Building the future of decentralized payment processing 🚀

## 📁 Scripts

### Available Scripts

- **`scripts/deploy.ts`**: Clean system deployment (production-ready)
- **`scripts/setup-production.ts`**: Production configuration (update addresses first)
- **`scripts/README.md`**: Detailed deployment documentation

### Quick Reference

**For Production:**
```bash
# 1. Deploy
npx hardhat run scripts/deploy.ts --network mainnet

# 2. Configure (update addresses first)
npx hardhat run scripts/setup-production.ts --network mainnet
```

**For Testing:**
```bash
# Complete deployment with verification
```
