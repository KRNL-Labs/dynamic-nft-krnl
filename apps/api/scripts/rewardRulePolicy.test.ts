import assert from "assert";
import {
  computeWebhookCredits,
  normalizeXpMode,
  resolveXpOverride,
  type EffectiveRewardRule
} from "../src/services/rewardRulePolicy";

const zealyRule: EffectiveRewardRule = {
  enabled: true,
  lootKeysDelta: 2,
  xpMode: "ZEALY",
  xpOverride: null
};

const overrideRule: EffectiveRewardRule = {
  enabled: true,
  lootKeysDelta: 1,
  xpMode: "OVERRIDE",
  xpOverride: 25
};

const noneRule: EffectiveRewardRule = {
  enabled: true,
  lootKeysDelta: 3,
  xpMode: "NONE",
  xpOverride: null
};

const disabledRule: EffectiveRewardRule = {
  enabled: false,
  lootKeysDelta: 3,
  xpMode: "OVERRIDE",
  xpOverride: 999
};

assert.strictEqual(normalizeXpMode("zealy"), "ZEALY");
assert.strictEqual(normalizeXpMode("OVERRIDE"), "OVERRIDE");
assert.strictEqual(normalizeXpMode("none"), "NONE");
assert.strictEqual(normalizeXpMode("invalid"), null);

assert.strictEqual(resolveXpOverride("OVERRIDE", 5), 5);
assert.strictEqual(resolveXpOverride("OVERRIDE", 0), 0);
assert.strictEqual(resolveXpOverride("OVERRIDE", -1), null);
assert.strictEqual(resolveXpOverride("ZEALY", 999), null);

{
  const result = computeWebhookCredits({ rule: zealyRule, zealyXp: 17 });
  assert.deepStrictEqual(result, { creditedXp: 17, creditedLootKeys: 2 });
}

{
  const result = computeWebhookCredits({ rule: overrideRule, zealyXp: 99 });
  assert.deepStrictEqual(result, { creditedXp: 25, creditedLootKeys: 1 });
}

{
  const result = computeWebhookCredits({ rule: noneRule, zealyXp: 88 });
  assert.deepStrictEqual(result, { creditedXp: 0, creditedLootKeys: 3 });
}

{
  const result = computeWebhookCredits({ rule: disabledRule, zealyXp: 88 });
  assert.deepStrictEqual(result, { creditedXp: 0, creditedLootKeys: 0 });
}

console.log("rewardRulePolicy tests passed");
