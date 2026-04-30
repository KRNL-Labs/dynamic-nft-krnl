import { AbiCoder, keccak256, toBeHex, toUtf8Bytes, zeroPadValue } from "ethers";

type TraitUpdateInput = { key: string; value: string };
type TraitUpdateEncoded = { key: string; value: string };

const isHexLike = (value: string) => /^0x[0-9a-fA-F]*$/.test(value);

const normalizeBytes32 = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed && isHexLike(trimmed)) {
    return zeroPadValue(trimmed as `0x${string}`, 32);
  }
  return keccak256(toUtf8Bytes(trimmed));
};

const parseNumericLike = (value: string | number | bigint): bigint | null => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  if (isHexLike(trimmed)) {
    return BigInt(trimmed);
  }
  return null;
};

const encodeTraitKey = (key: string): string => {
  return normalizeBytes32(key);
};

const encodeTraitValue = (value: string | number | bigint): string => {
  const numeric = parseNumericLike(value);
  if (numeric !== null) {
    return zeroPadValue(toBeHex(numeric), 32);
  }
  return normalizeBytes32(String(value));
};

const encodeTraitUpdates = (updates: TraitUpdateInput[]): TraitUpdateEncoded[] => {
  return updates.map((update) => ({
    key: encodeTraitKey(update.key),
    value: encodeTraitValue(update.value)
  }));
};

const parseUint256 = (value: string | number | bigint): bigint => {
  const numeric = parseNumericLike(value);
  if (numeric === null) {
    throw new Error(`Invalid uint256 value: ${value}`);
  }
  if (numeric < BigInt(0)) {
    throw new Error(`Invalid uint256 value: ${value}`);
  }
  return numeric;
};

export const encodeQuestAuthData = (args: {
  tokenId: string;
  questIdNumeric: bigint;
  zealyQuestId: string;
  xpDelta: number;
  lootKeysDelta: number;
  traitUpdates: TraitUpdateInput[];
}): { authResultHex: string; authSignatureHex: string } => {
  const encodedTraits = encodeTraitUpdates(args.traitUpdates);
  const coder = AbiCoder.defaultAbiCoder();

  const questResult = {
    tokenId: parseUint256(args.tokenId),
    questId: args.questIdNumeric,
    xpDelta: parseUint256(args.xpDelta ?? 0),
    traits: encodedTraits
  };

  const authResultHex = coder.encode(
    [
      "tuple(uint256 tokenId, uint256 questId, uint256 xpDelta, tuple(bytes32 key, bytes32 value)[] traits)"
    ],
    [questResult]
  );

  return { authResultHex, authSignatureHex: "0x" };
};

export const encodeLootboxAuthData = (args: {
  tokenId: string;
  traitUpdates: TraitUpdateInput[];
}): { authResultHex: string; authSignatureHex: string } => {
  const encodedTraits = encodeTraitUpdates(args.traitUpdates);
  const coder = AbiCoder.defaultAbiCoder();

  const lootboxResult = {
    tokenId: parseUint256(args.tokenId),
    traits: encodedTraits
  };

  const authResultHex = coder.encode(
    ["tuple(uint256 tokenId, tuple(bytes32 key, bytes32 value)[] traits)"],
    [lootboxResult]
  );

  return { authResultHex, authSignatureHex: "0x" };
};
