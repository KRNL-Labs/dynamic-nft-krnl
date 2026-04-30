import { ethers } from "hardhat";

const requireEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const parseList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const toBytes32 = (value: string): string => {
  if (value.startsWith("0x")) {
    return ethers.zeroPadValue(value, 32);
  }
  return ethers.keccak256(ethers.toUtf8Bytes(value));
};

const toBytes32Value = (value: string): string => {
  if (value.startsWith("0x")) {
    return ethers.zeroPadValue(value, 32);
  }
  return ethers.zeroPadValue(ethers.toBeHex(BigInt(value)), 32);
};

async function main() {
  const tokenId = BigInt(requireEnv("TOKEN_ID"));
  const keysRaw = parseList(requireEnv("KEYS"));
  const valuesRaw = parseList(requireEnv("VALUES"));

  if (keysRaw.length !== valuesRaw.length) {
    throw new Error("KEYS and VALUES length mismatch");
  }

  const keys = keysRaw.map(toBytes32);
  const values = valuesRaw.map(toBytes32Value);

  const coder = ethers.AbiCoder.defaultAbiCoder();
  const payload = coder.encode(["uint256", "bytes32[]", "bytes32[]"], [tokenId, keys, values]);

  console.log("setActiveTraitsAuth payload:", payload);
  console.log("decoded:");
  console.log("  tokenId:", tokenId.toString());
  console.log("  keys:", keys);
  console.log("  values:", values);
  console.log("Note: non-hex keys are hashed with keccak256(utf8). Values accept hex or decimal.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
