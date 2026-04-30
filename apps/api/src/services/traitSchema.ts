import { keccak256, toUtf8Bytes } from "ethers";

type TraitSchemaEntry = {
  key: string;
  label: string;
  type: "uint";
  bounds?: { min?: number; max?: number };
};

export const getTraitSchema = () => {
  const traits: TraitSchemaEntry[] = [
    { label: "XP", bounds: { min: 0 } },
    { label: "LEVEL", bounds: { min: 1 } },
    { label: "RARITY", bounds: { min: 0, max: 5 } },
    { label: "LOOT_KEYS", bounds: { min: 0 } }
  ].map((entry) => ({
    key: keccak256(toUtf8Bytes(entry.label)),
    label: entry.label,
    type: "uint" as const,
    bounds: entry.bounds
  }));

  return {
    version: "1.0.0",
    traits
  };
};
