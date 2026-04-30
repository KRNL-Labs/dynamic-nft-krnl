import { run, ethers } from "hardhat";

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

async function main() {
  requireEnv("ETHERSCAN_API_KEY");

  const contractAddress = requireAddress("QUEST_PROGRESS_NFT_ADDRESS");

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

  console.log("Verifying QuestProgressNFT at:", contractAddress);
  console.log("Constructor args:");
  console.log("  name:", name);
  console.log("  symbol:", symbol);
  console.log("  masterKey:", masterKey);
  console.log("  recoveryKey:", recoveryKey);
  console.log("  owner:", owner);
  console.log("  delegatedAccountImpl:", delegatedImpl);
  if (process.env.TRAIT_METADATA_URI) {
    console.log("Note: trait metadata URI is set via owner-only setTraitMetadataURI.");
  }
  console.log("Note: mintBaseNFT expects authData.result = abi.encode(uint256 brandId).");
  console.log("Note: applyQuestResult/openLootbox payloads must include brandId and will revert on mismatch.");
  console.log("Note: setActiveTraitsAuth expects authData.result = abi.encode(uint256 tokenId, bytes32[] keys, bytes32[] values).");

  await run("verify:verify", {
    address: contractAddress,
    constructorArguments: [
      name,
      symbol,
      masterKey,
      recoveryKey,
      owner,
      delegatedImpl,
    ],
  });

  console.log("Verification submitted for:", contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
