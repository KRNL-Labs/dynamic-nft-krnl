# Dynamic NFT KRNL Contracts

## QuestProgressNFT Access Notes
- Owner-only admin: `setMetadataBaseURI(string)` (platform/KRNL executor).
- KRNL-auth (requireAuth): `mintBaseNFT(AuthData,address)`, `applyQuestResult(AuthData)`, `openLootbox(AuthData)`, and `setMetadataBaseURIAuth(AuthData)`.
