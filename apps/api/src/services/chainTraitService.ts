import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";

const TRAIT_ABI = ["function getUintTrait(uint256 tokenId, bytes32 key) view returns (uint256)"];
const ERC7496_ABI = [
  "function getTraitValue(uint256 tokenId, bytes32 key) view returns (uint256)",
  "function getTrait(uint256 tokenId, bytes32 key) view returns (uint256)"
];

export const readUintTrait = async (args: {
  rpcUrl: string;
  contractAddress: string;
  tokenId: string;
  traitKey: string;
}): Promise<bigint> => {
  const { rpcUrl, contractAddress, tokenId, traitKey } = args;
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(contractAddress, TRAIT_ABI, provider);
  const key = keccak256(toUtf8Bytes(traitKey));
  const value = await contract.getUintTrait(BigInt(tokenId), key);
  return BigInt(value);
};

export const readCoreTraits = async (args: {
  rpcUrl: string;
  contractAddress: string;
  tokenId: string;
}): Promise<{ xp: bigint; lootKeys: bigint }> => {
  const { rpcUrl, contractAddress, tokenId } = args;
  const [xp, lootKeys] = await Promise.all([
    readUintTrait({ rpcUrl, contractAddress, tokenId, traitKey: "XP" }),
    readUintTrait({ rpcUrl, contractAddress, tokenId, traitKey: "LOOT_KEYS" })
  ]);

  return { xp, lootKeys };
};

// ERC-7496 helper: try getTraitValue() first, fallback to getTrait().
// This is additive and does not change existing read paths.
export const readTraitValueWithFallback = async (args: {
  rpcUrl: string;
  contractAddress: string;
  tokenId: string;
  traitKey: string;
}): Promise<bigint> => {
  const { rpcUrl, contractAddress, tokenId, traitKey } = args;
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(contractAddress, ERC7496_ABI, provider);
  const key = keccak256(toUtf8Bytes(traitKey));
  try {
    const value = await contract.getTraitValue(BigInt(tokenId), key);
    return BigInt(value);
  } catch {
    const value = await contract.getTrait(BigInt(tokenId), key);
    return BigInt(value);
  }
};
