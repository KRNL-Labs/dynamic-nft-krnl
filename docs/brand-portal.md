# Brand Portal

Brand owners log in, select the brand portal, and create brands. Each brand can connect a Zealy community with a `communityId`, API key, and optional webhook secret.

Quest sync pulls Zealy quest data into the API. In production, Zealy XP is the source of truth for owner XP.

Asset packs contain one base image and trait layer images keyed by `traitName` and `traitValue`. Lootbox configuration defines `xpPerLootKey`, `lootKeysPerOpen`, `maxUnlocksPerOpen`, and weighted entries for trait unlocks.

The portal also exposes workflow runs so owners can see KRNL submission and status progression. Billing and credit top-up routes are preserved where implemented by the copied API.
