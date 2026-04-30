require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const normalizePrivateKey = (value) => {
  if (!value) return "";
  return value.startsWith("0x") ? value : `0x${value}`;
};

module.exports = {
  solidity: {
    version: "0.8.25",
    settings: {
      evmVersion: "cancun",
    },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [normalizePrivateKey(DEPLOYER_PRIVATE_KEY)] : [],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  sourcify: {
    enabled: false,
  },
};
