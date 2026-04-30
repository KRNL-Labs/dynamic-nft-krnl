import { ethers } from "hardhat";

const DEFAULT_NFT_NAME = "QuestProgressNFT";
const DEFAULT_NFT_SYMBOL = "QPNFT";
const DEFAULT_DELEGATED_ACCOUNT_IMPL =
  "0x9969827E2CB0582e08787B23F641b49Ca82bc774";

const requireEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const readEnv = (key: string, fallback: string): string => {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : fallback;
};

const requireAddress = (key: string): string => {
  const value = requireEnv(key);
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address for ${key}: ${value}`);
  }
  return ethers.getAddress(value);
};

const normalizePrivateKey = (value: string): string => {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hex string");
  }
  return normalized;
};

async function main() {
  requireEnv("SEPOLIA_RPC_URL");
  const privateKey = normalizePrivateKey(requireEnv("DEPLOYER_PRIVATE_KEY"));

  const name = readEnv("NFT_NAME", DEFAULT_NFT_NAME);
  const symbol = readEnv("NFT_SYMBOL", DEFAULT_NFT_SYMBOL);

  const masterKey = requireAddress("MASTER_KEY_ADDRESS");
  const recoveryKey = requireAddress("RECOVERY_KEY_ADDRESS");
  const owner = requireAddress("OWNER_ADDRESS");

  const delegatedImpl = readEnv(
    "DELEGATED_ACCOUNT_IMPL_ADDRESS",
    DEFAULT_DELEGATED_ACCOUNT_IMPL
  );
  if (!ethers.isAddress(delegatedImpl)) {
    throw new Error(`Invalid address for DELEGATED_ACCOUNT_IMPL_ADDRESS: ${delegatedImpl}`);
  }

  const deployer = new ethers.Wallet(privateKey, ethers.provider);
  console.log("Deploying with:", deployer.address);

  const QuestProgressNFT = await ethers.getContractFactory("QuestProgressNFT", deployer);
  const nft = await QuestProgressNFT.deploy(
    name,
    symbol,
    masterKey,
    recoveryKey,
    owner,
    delegatedImpl
  );
  await nft.waitForDeployment();

  const address = await nft.getAddress();
  console.log("QuestProgressNFT deployed to:", address);
  console.log("Constructor args:");
  console.log("  name:", name);
  console.log("  symbol:", symbol);
  console.log("  masterKey:", masterKey);
  console.log("  recoveryKey:", recoveryKey);
  console.log("  owner:", owner);
  console.log("  delegatedAccountImpl:", delegatedImpl);
  console.log("On-chain state:");
  console.log("  masterKey():", await nft.masterKey());
  console.log("  recoveryKey():", await nft.recoveryKey());
  console.log("  owner():", await nft.owner());
  console.log("  delegatedAccountCodeHash:", await nft.delegatedAccountCodeHash());
  console.log("  isDelegatedAccountSet():", await nft.isDelegatedAccountSet());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
