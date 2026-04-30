# Architecture

Dynamic NFT KRNL is a standalone monorepo with four runtime surfaces: `apps/web`, `apps/api`, `packages/contracts`, and `packages/workflows`.

Brand owners use the web app to create brands, connect Zealy, sync quests, upload asset packs, configure lootboxes, and inspect KRNL workflow runs. NFT owners use the web app to select a brand, spend XP on LootKeys, open lootboxes, unlock traits, select active traits, and view the rendered NFT.

The API owns authentication, portal enforcement, brand data, Zealy integration, XP accounting, lootbox logic, asset upload metadata, image rendering, metadata routes, workflow rendering, KRNL submission, and workflow status polling. Postgres stores relational state through Prisma. S3 or MinIO stores uploaded base images and trait layers.

The on-chain model is one global ERC-721 contract shared across brands. Brand-specific metadata is resolved off-chain by token and brand state. ERC-7496 trait support exposes active trait state without requiring per-brand metadata base URI changes on-chain.

KRNL workflow templates live in `packages/workflows/workflows`; the API defaults to that path and renders templates with runtime parameters before submission.
