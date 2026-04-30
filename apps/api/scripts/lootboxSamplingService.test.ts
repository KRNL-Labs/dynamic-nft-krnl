import assert from "assert";
import {
  normalizeLootTableEntries,
  sampleWeightedLootEntries,
  type LootTableEntry
} from "../src/services/lootboxSamplingService";
import {
  calculatePurchaseXpRequired,
  calculateXpAvailable
} from "../src/services/lootboxEconomyService";

const normalized = normalizeLootTableEntries({
  entries: [
    { traitName: "RARITY", traitValue: "1", weight: 10 },
    { traitName: "", traitValue: "2", weight: 5 },
    { traitName: "RARITY", traitValue: "3", weight: 0 }
  ]
});
assert.strictEqual(normalized.length, 1);
assert.deepStrictEqual(normalized[0], { traitName: "RARITY", traitValue: "1", weight: 10 });

const entries: LootTableEntry[] = [
  { traitName: "RARITY", traitValue: "1", weight: 1 },
  { traitName: "RARITY", traitValue: "2", weight: 3 },
  { traitName: "EYES", traitValue: "gold", weight: 2 }
];

const rolls = [0.9, 0.1, 0.8, 0.2, 0.6];
let idx = 0;
const random = () => {
  const value = rolls[idx % rolls.length];
  idx += 1;
  return value;
};

const sampled = sampleWeightedLootEntries({
  entries,
  count: 2,
  random,
  excludedKeys: new Set(["RARITY::1"])
});
assert.ok(sampled.length >= 1 && sampled.length <= 2);
assert.ok(sampled.every((item) => `${item.traitName}::${item.traitValue}` !== "RARITY::1"));
assert.strictEqual(new Set(sampled.map((item) => `${item.traitName}::${item.traitValue}`)).size, sampled.length);

assert.strictEqual(calculatePurchaseXpRequired(3, 50), 150);
assert.strictEqual(calculatePurchaseXpRequired(-1, 50), 0);
assert.strictEqual(calculateXpAvailable(1000, 250), 750);
assert.strictEqual(calculateXpAvailable(100, 200), 0);

console.log("lootboxSamplingService tests passed");
