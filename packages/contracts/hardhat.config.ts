import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const normalizePrivateKey = (value: string) => {
  if (!value) return "";
  return value.startsWith("0x") ? value : `0x${value}`;
};

const config: HardhatUserConfig = {
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

export default config;
