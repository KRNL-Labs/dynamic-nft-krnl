import assert from "assert";
import {
  buildZealyJoinUrl,
  resolveDefaultXpPerLootKey
} from "../src/services/lootboxEconomyService";

const originalXpPrice = process.env.XP_PRICE_PER_LOOTKEY;
const originalXpPer = process.env.XP_PER_LOOTKEY;

process.env.XP_PRICE_PER_LOOTKEY = "250";
process.env.XP_PER_LOOTKEY = "100";
assert.strictEqual(resolveDefaultXpPerLootKey(), 250);

process.env.XP_PRICE_PER_LOOTKEY = "";
process.env.XP_PER_LOOTKEY = "120";
assert.strictEqual(resolveDefaultXpPerLootKey(), 120);

process.env.XP_PRICE_PER_LOOTKEY = "-5";
process.env.XP_PER_LOOTKEY = "foo";
assert.strictEqual(resolveDefaultXpPerLootKey(), 100);

assert.strictEqual(buildZealyJoinUrl("my-community"), "https://zealy.io/c/my-community");
assert.strictEqual(buildZealyJoinUrl(""), "https://zealy.io");

if (originalXpPrice === undefined) {
  delete process.env.XP_PRICE_PER_LOOTKEY;
} else {
  process.env.XP_PRICE_PER_LOOTKEY = originalXpPrice;
}
if (originalXpPer === undefined) {
  delete process.env.XP_PER_LOOTKEY;
} else {
  process.env.XP_PER_LOOTKEY = originalXpPer;
}

console.log("lootboxEconomyService tests passed");
