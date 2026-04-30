import assert from "assert";
import { keccak256, toUtf8Bytes } from "ethers";

const { getTraitSchema } = require("../src/services/traitSchema");

const schema = getTraitSchema();

try {
  assert.strictEqual(schema.version, "1.0.0");
  const labels = schema.traits.map((t: any) => t.label).sort();
  assert.deepStrictEqual(labels, ["LEVEL", "LOOT_KEYS", "RARITY", "XP"].sort());

  const byLabel = Object.fromEntries(schema.traits.map((t: any) => [t.label, t]));
  const xpKey = keccak256(toUtf8Bytes("XP"));
  const levelKey = keccak256(toUtf8Bytes("LEVEL"));
  const rarityKey = keccak256(toUtf8Bytes("RARITY"));
  const lootKey = keccak256(toUtf8Bytes("LOOT_KEYS"));

  assert.strictEqual(byLabel.XP.key, xpKey);
  assert.strictEqual(byLabel.LEVEL.key, levelKey);
  assert.strictEqual(byLabel.RARITY.key, rarityKey);
  assert.strictEqual(byLabel.LOOT_KEYS.key, lootKey);

  console.log("PASS: /api/traits/schema trait schema");
} catch (error) {
  console.error("FAIL: /api/traits/schema trait schema");
  console.error(error);
  process.exit(1);
}
