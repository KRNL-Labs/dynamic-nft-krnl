# Lootboxes

Lootboxes convert XP into LootKeys, then LootKeys into unlocked traits.

Configuration:

- `xpPerLootKey` or environment fallback pricing.
- `lootKeysPerOpen`.
- `maxUnlocksPerOpen`.
- Weighted entries with `traitName`, `traitValue`, and `weight`.

Demo mode grants default XP and allows local buying/opening without live Zealy XP. Production mode should validate spendable XP against Zealy-derived state.
