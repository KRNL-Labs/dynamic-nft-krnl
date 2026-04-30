# API

The API is mounted under `/api` except public metadata routes.

- Auth: `/api/auth/*`, `/api/auth/me`, `/api/auth/logout`.
- System: `/api/health`, `/api/system/config`, `/api/traits/schema`.
- Brand portal: `/api/brands`, brand detail routes, Zealy connection and sync routes, asset pack routes, lootbox routes, workflow routes, and billing routes.
- Owner portal: `/api/me/*`, including brands, XP, LootKeys, lootbox opening, unlocked traits, active traits, and rendered NFT data.
- Metadata: public NFT metadata and image/rendering routes mounted at `/`.
- Workflows: `/api/workflows/*` for submitted workflow run data.
- Zealy webhooks: `/api/zealy/*` webhook routes.
- Billing: `/api/billing/*` where enabled.
- Internal/dev: `/api/internal/*` and `/api/dev/*`; dev routes are disabled in production.

Authentication and portal middleware protect brand-owner and NFT-owner surfaces separately.
