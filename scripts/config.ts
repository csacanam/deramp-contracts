// Configuration for Deramp deployment
// Contract addresses are automatically updated by deploy.ts

export const CONTRACT_ADDRESSES = {
  proxy: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  accessManager: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  invoiceManager: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  paymentProcessor: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
  treasuryManager: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
  withdrawalManager: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
};

// MANUAL CONFIGURATION: Team member addresses
export const TEAM_ADDRESSES = {
  admin: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Replace with real address
  onboarding: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Replace with real address
  tokenManager: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Replace with real address
  treasuryManager: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Replace with real address
  backendOperator: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Replace with real address
};

// MANUAL CONFIGURATION: Production token addresses
export const PRODUCTION_TOKENS = [
  // USDC Mainnet: 0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8
  // USDT Mainnet: 0xdAC17F958D2ee523a2206206994597C13D831ec7
  // DAI Mainnet: 0x6B175474E89094C44Da98b954EedeAC495271d0F
  // Add real token addresses here
];

// MANUAL CONFIGURATION: Treasury wallet
export const TREASURY_WALLET = {
  address: "0xD0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8", // Replace with real address
  description: "Main Treasury Wallet"
};

// Validation constants
export const VALIDATION = {
  EMPTY_ADDRESS: "0x0000000000000000000000000000000000000000",
  EXAMPLE_ADDRESS: "0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8",
  EXAMPLE_TREASURY: "0xD0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8",
}; 