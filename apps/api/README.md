# Dynamic NFT KRNL API

Express + Prisma backend for the KRNL NFT platform.

This service exposes:
- Brand portal APIs for brand setup, Zealy connection, asset packs, NFT contract config, lootbox config, billing, and workflow monitoring.
- Owner portal APIs for brand discovery, join/mint, XP + loot key balances, lootbox open, unlocked traits, and active trait selection.
- Public metadata and image render endpoints for NFTs.
- Internal and dev-only helper endpoints.

## Runtime

- Default local base URL: `http://localhost:8000`
- JSON API base path: `/api`
- Public NFT endpoints live at the root:
  - `GET /metadata/:tokenId`
  - `GET /render/:tokenId.png`

## Required Environment

Required:
- `DATABASE_URL`
- `PRIVY_APP_ID`
- `WORKFLOW_TEMPLATES_DIR`
- `GLOBAL_METADATA_BASE_URI` or `METADATA_BASE_URL`

Metadata base URI rules:
- must be a valid URL
- must end with `/`

Commonly used optional env vars:
- `CORS_ORIGIN`
- `PORT`
- `DEMO_MODE`
- `RPC_SEPOLIA_URL` or `SEPOLIA_RPC_URL`
- `DEFAULT_NFT_CONTRACT_ADDRESS`
- `TRAIT_METADATA_URI`
- `INTERNAL_API_KEY`
- `XP_PRICE_PER_LOOTKEY` or `XP_PER_LOOTKEY`
- `KRNL_NODE_URL`

## Auth, Headers, and Portal Model

Authenticated routes use a Privy JWT:

```http
Authorization: Bearer <privy-access-token>
```

Wallet-aware routes also use:

```http
X-Wallet-Address: 0x...
```

Internal routes use:

```http
X-Internal-Api-Key: <internal api key>
```

Portal session behavior:
- Portal selection is stored server-side in `PortalSession`, keyed by Privy user id.
- Brand routes use `portalType=brand`.
- Owner routes use `portalType=owner`.
- `/api/brands` and `/api/brands/me` require brand portal but do not require a selected `brandId`.
- `/api/brands/:brandId/*` require brand portal and the selected `brandId` must match the route.
- `/api/me/*` require owner portal.
- `GET /api/auth/me` does not require `X-Wallet-Address`; it returns the last wallet saved in portal session.

Common auth/portal errors:
- `401 { error: "Unauthorized" }`
- `400 { error: "Wallet required" }`
- `409 { error: "Portal not selected" }`
- `403 { error: "Wrong portal" }`

CORS:
- `OPTIONS` preflight is handled before auth middleware.
- Allowed custom headers include `authorization`, `x-wallet-address`, and `x-internal-api-key`.

## Public API

### `GET /api/health`
Returns:

```json
{ "status": "ok" }
```

### `GET /api/system/config`
Returns current chain and metadata config:

```json
{
  "chainId": 11155111,
  "contractAddress": "0x...",
  "globalMetadataBaseUri": "http://localhost:8000/metadata/",
  "traitMetadataUri": "http://localhost:8000/traits/schema",
  "erc7496Supported": true,
  "krnlNodeUrl": "https://node.krnl.xyz",
  "globalContractAddress": "0x...",
  "metadataBaseUrl": "http://localhost:8000/metadata/"
}
```

If metadata base URI is not configured:
- `500 { error: "GLOBAL_METADATA_BASE_URI not configured" }`

### `GET /api/traits/schema`
Returns ERC-7496-style trait metadata schema:

```json
{
  "version": "1.0.0",
  "traits": [
    {
      "key": "0x...",
      "label": "XP",
      "type": "uint",
      "bounds": { "min": 0 }
    }
  ]
}
```

### `GET /metadata/:tokenId`
Returns NFT metadata JSON for a token. Current metadata includes:
- `name`
- `description`
- `image`
- `animation_url`
- `attributes` for `XP`, `LEVEL`, `RARITY`

### `GET /render/:tokenId.png`
Returns a server-rendered PNG composite for the token’s active trait layers.

Behavior:
- loads the active asset pack for the token’s brand
- composites base image + active `layer` assets
- caches rendered output in object storage

## Auth API

### `GET /api/auth/wallet-status`
Auth required.

Requires:
- `Authorization`
- `X-Wallet-Address`

Returns:
- `walletAddress`
- `chainId`
- `isDelegated`

### `POST /api/auth/select-portal`
Auth required.

Requires:
- `Authorization`
- `X-Wallet-Address`

Body:

```json
{ "portalType": "brand", "brandId": "uuid-or-null" }
```

or

```json
{ "portalType": "owner" }
```

Behavior:
- `portalType="owner"` stores owner portal with `brandId=null`
- `portalType="brand"` stores brand portal
- if `brandId` is missing for brand portal and an existing brand selection exists, the backend preserves it
- if `brandId` is present, ownership is validated against `Brand.ownerUserId`

Returns:

```json
{ "portalType": "brand", "brandId": "uuid-or-null" }
```

### `GET /api/auth/me`
Auth required.

Returns current server-side portal session:

```json
{
  "walletAddress": "0x...",
  "portalType": "brand",
  "brandId": "uuid-or-null"
}
```

### `POST /api/auth/logout`
Auth required.

Requires:
- `Authorization`
- `X-Wallet-Address`

Behavior:
- clears stored portal selection for the authenticated Privy user

Returns:

```json
{ "ok": true }
```

## Owner Portal API

All owner endpoints require:
- `Authorization`
- `X-Wallet-Address`
- owner portal selection

### `GET /api/me/brands`
Returns brands available to the owner portal.

Query params:
- optional `scope=joined`

Default response shape:

```json
[
  {
    "id": "uuid",
    "name": "Brand",
    "logoUrl": "http://...",
    "primaryChainId": 11155111,
    "hasZealyConfig": true,
    "zealySubdomain": "community-id-or-null",
    "hasMembership": false,
    "tokenId": null
  }
]
```

### `POST /api/me/brands/:brandId/select`
Stores the owner’s active brand in portal session.

Returns:

```json
{ "ok": true, "brandId": "uuid" }
```

### `POST /api/me/brands/:brandId/join`
Ensures the wallet has a base NFT for the brand.

Returns either:

```json
{
  "ok": true,
  "state": "submitted",
  "runId": "uuid",
  "requestId": "uuid-or-null",
  "intentId": "0x... or null",
  "tokenId": null
}
```

or

```json
{
  "ok": true,
  "state": "minted",
  "runId": null,
  "tokenId": "string"
}
```

### `GET /api/me/runs/:runId`
Returns owner-visible workflow run status for the wallet.

Response includes:
- `runId`
- `brandId`
- `status`
- `txHash`
- `requestId`
- `intentId`
- `krnlIntentId`
- `error`
- timestamps

### `GET /api/me/brands/:brandId/asset-pack/active`
Returns the active asset pack payload needed by the owner UI:

```json
{
  "activeAssetPackId": "uuid",
  "baseImageUrl": "http://...",
  "layers": [
    {
      "traitName": "Background",
      "traitValue": "Blue",
      "imageUrl": "http://..."
    }
  ]
}
```

### `GET /api/me/traits?brandId=<uuid>`
Returns unlocked and active traits for the wallet + brand.

Current response shape:

```json
{
  "unlocked": [
    {
      "imageUrl": "http://... or null",
      "id": "uuid",
      "traitKey": "Background",
      "traitValue": "blue",
      "tokenId": "string-or-null",
      "unlockedAt": "ISO timestamp",
      "isActive": false,
      "activeAt": null
    }
  ],
  "active": [
    {
      "imageUrl": "http://... or null",
      "id": "uuid",
      "traitKey": "Background",
      "traitValue": "blue",
      "tokenId": "string-or-null",
      "unlockedAt": "ISO timestamp",
      "isActive": true,
      "activeAt": "ISO timestamp"
    }
  ]
}
```

`imageUrl` is resolved from matching uploaded `layer/state` assets using `traitKey:traitValue`.

### `POST /api/me/open-lootbox`
Body:

```json
{ "brandId": "uuid" }
```

Behavior:
- ensures base NFT exists or submits mint first
- checks brand active asset pack and lootbox config
- checks owner loot key balance
- samples unlocks from weighted loot table, excluding already unlocked traits
- persists newly unlocked traits off-chain
- submits lootbox workflow

Success response:

```json
{
  "ok": true,
  "runId": "uuid",
  "requestId": "uuid-or-null",
  "intentId": "0x... or null",
  "unlocked": [
    { "traitName": "Background", "traitValue": "blue" }
  ],
  "lootKeysSpent": 1,
  "lootKeysBalance": 0
}
```

Important error cases:
- `400 { error: "Insufficient loot keys" }`
- `400 { error: "Brand active asset pack is not set" }`
- `400 { error: "Lootbox is disabled for this brand" }`
- `400 { error: "Lootbox config enabled but loot table is empty" }`
- `409 { error: "No unlockable traits remaining for current lootbox", ... }`

### `POST /api/me/traits/activate`
Body:

```json
{
  "brandId": "uuid",
  "selections": [
    { "traitKey": "Background", "traitValue": "blue" }
  ]
}
```

Notes:
- `traitName` is also accepted as an alias for `traitKey`
- max 5 active selections
- every selection must already be unlocked

Returns:

```json
{
  "ok": true,
  "runId": "uuid",
  "active": [
    { "traitName": "Background", "traitValue": "blue" }
  ]
}
```

### `GET /api/me/nfts?brandId=<uuid>`
Returns token ids known for the wallet + brand:

```json
{
  "wallet": "0x...",
  "nfts": [{ "tokenId": "123" }]
}
```

### `POST /api/me/lootkeys/buy`
Alias:
- `POST /api/me/lootkeys/purchase`

Body:

```json
{ "brandId": "uuid", "quantity": 2 }
```

`qty` is accepted as an alias for `quantity`.

Behavior:
- loads `xpPerLootKey` from `LootboxConfig`
- falls back to env default if no config exists
- increments `xpSpent`
- increments `lootKeysBalance`

Returns:

```json
{
  "ok": true,
  "xp": 9800,
  "xpRemaining": 9800,
  "lootKeys": 2,
  "brandId": "uuid"
}
```

Error:
- `409 { error: "Insufficient XP", requiredXp, currentXp }`

### `GET /api/me/balances?brandId=<uuid>`
Returns:

```json
{
  "xp": 9800,
  "lootKeys": 2,
  "xpBalance": 9800,
  "lootKeysBalance": 2
}
```

### `GET /api/me/xp?brandId=<uuid>`
Returns owner economy context:

```json
{
  "brandId": "uuid",
  "wallet": "0x...",
  "zealyXpTotal": 10000,
  "zealyXp": 10000,
  "spentXp": 200,
  "xpAvailable": 9800,
  "availableXp": 9800,
  "lootKeysBalance": 2,
  "xpPerLootKey": 100,
  "lootKeysPerOpen": 1,
  "lootboxXpCost": 100,
  "lootboxEnabled": true,
  "xp": 9800,
  "xpSource": "demo-ledger"
}
```

## Brand Portal API

All brand endpoints require:
- `Authorization`
- `X-Wallet-Address`
- brand portal selection

For `/api/brands/:brandId/*`:
- selected portal `brandId` must match the route `:brandId`

### Brand CRUD and portal data

#### `POST /api/brands`
Multipart request supported.

Body fields:
- `name`
- `description`
- `logoUrl`
- `primaryChainId`
- optional multipart file field `logo`

Behavior:
- creates brand owned by `auth.privyUserId`
- if `logo` file is uploaded, stores it in object storage and replaces `logoUrl`

Returns created brand summary:
- `id`
- `name`
- `description`
- `logoUrl`
- `primaryChainId`
- `hasZealyConfig`
- `sponsorshipCredits`

#### `GET /api/brands`
Lists brands owned by the authenticated brand admin.

#### `GET /api/brands/me`
Alias-style listing for owned brands.

#### `GET /api/brands/:brandId`
Returns brand summary:
- `id`
- `name`
- `description`
- `logoUrl`
- `primaryChainId`
- `hasZealyConfig`
- `zealySubdomain`
- `credits`

### Automation config

#### `GET /api/brands/:brandId/automation`
Returns:
- `automationWalletAddress`
- `krnlSenderAddress`
- `krnlDelegationStatus`
- `krnlDelegationTxHash`
- `krnlDelegationUpdatedAt`

#### `POST /api/brands/:brandId/automation`
Body fields:
- `automationWalletAddress`
- `krnlSenderAddress`
- `krnlDelegationStatus`
- `krnlDelegationTxHash`

Updates stored automation/delegation metadata.

### Zealy

#### `POST /api/brands/:brandId/zealy`
Alias:
- `POST /api/brands/:brandId/zealy/connect`

Body:

```json
{
  "communityId": "community-or-subdomain",
  "apiKey": "zealy-api-key",
  "webhookSecret": "optional"
}
```

`subdomain` is accepted as an alias for `communityId`.

Behavior:
- validates API key by fetching quests
- stores Zealy config + connection
- marks `Brand.hasZealyConfig=true`
- triggers quest sync

Returns:

```json
{ "ok": true }
```

#### `POST /api/brands/:brandId/zealy/sync`
Alias:
- `POST /api/brands/:brandId/zealy/sync-quests`

Returns:

```json
{ "ok": true, "synced": 12 }
```

### Membership and quests

#### `POST /api/brands/:brandId/join`
Legacy join route that requires a user signature and sponsorship credits.

Body/header intent inputs accepted:
- `userSignature`
- `intentSignature`
- `transactionIntentSignature`
- `transactionIntentDelegate`
- `transactionIntentId`
- `transactionIntentDeadline`

Response:

```json
{
  "brandId": "uuid",
  "walletAddress": "0x...",
  "tokenId": "string",
  "status": "joined"
}
```

#### `GET /api/brands/:brandId/memberships/me`
Returns membership tokens for the current wallet:

```json
{
  "brandId": "uuid",
  "walletAddress": "0x...",
  "tokens": [{ "tokenId": "123" }]
}
```

#### `GET /api/brands/:brandId/quests`
Returns synced Zealy quests for the brand:

```json
{
  "quests": [
    {
      "id": "zealyQuestId",
      "zealyQuestId": "zealyQuestId",
      "title": "Quest title",
      "description": "optional",
      "xp": 100,
      "xpReward": 100,
      "status": "active",
      "updatedAt": "ISO timestamp"
    }
  ]
}
```

#### `GET /api/brands/:brandId/quests/state`
Wallet-specific quest state summary. Requires `X-Wallet-Address`.

### Lootbox config

#### `GET /api/brands/:brandId/lootbox/config`
Returns:

```json
{
  "brandId": "uuid",
  "enabled": true,
  "xpPerKey": 100,
  "xpPerLootKey": 100,
  "lootKeysPerOpen": 1,
  "xpCost": 100,
  "maxUnlocksPerOpen": 1,
  "lootTable": {
    "entries": [
      {
        "traitKey": "Background",
        "traitName": "Background",
        "traitValue": "blue",
        "weight": 10
      }
    ]
  }
}
```

#### `POST /api/brands/:brandId/lootbox/config`
Accepts either:
- `lootTable` as an array
- `lootTable.entries` as an array

Body fields:
- `enabled`
- `xpPerKey` or `xpPerLootKey` or `xpCost`
- `lootKeysPerOpen`
- `maxUnlocksPerOpen`
- `lootTable`

Entry shape:

```json
{
  "traitKey": "Background",
  "traitName": "Background",
  "traitValue": "blue",
  "weight": 10
}
```

Validation:
- `xpPerLootKey >= 1`
- `lootKeysPerOpen >= 1`
- `maxUnlocksPerOpen >= 1`
- if enabled, loot table must be non-empty
- every entry must map to an uploaded `layer/state` asset in the active asset pack

### NFT contract config

#### `POST /api/brands/:brandId/nft/contract`
Body:

```json
{
  "contractAddress": "0x...",
  "chainId": 11155111,
  "rpcUrl": "https://...",
  "activeAssetPackId": "uuid-or-null"
}
```

#### `GET /api/brands/:brandId/nft/contract`
Returns:
- `contractAddress`
- `chainId`
- `rpcUrl`
- `activeAssetPackId`

#### `GET /api/brands/:brandId/contract`
Returns:
- `chainId`
- `contractAddress`
- `baseUriOnchain`
- `baseUriExpected`

### Asset packs and uploads

#### `POST /api/brands/:brandId/nft/asset-packs`
Body:

```json
{ "name": "Pack name", "description": "optional" }
```

Returns:

```json
{ "id": "uuid", "name": "Pack name" }
```

#### `GET /api/brands/:brandId/nft/asset-packs`
Returns pack summaries with public base/preview image URLs.

#### `POST /api/brands/:brandId/nft/asset-packs/:packId/upload`
Multipart request.

Fields:
- file field: `file`
- body field `kind`: `base | state | layer`
- for `state` and `layer`: `traitName`, `traitValue`

Returns:

```json
{
  "ok": true,
  "objectKey": "brands/.../packs/.../layer/file.png",
  "assetObjectId": "uuid"
}
```

#### `GET /api/brands/:brandId/nft/asset-packs/:packId/assets`
Returns uploaded asset objects:
- `id`
- `kind`
- `traitName`
- `traitValue`
- `objectKey`
- `publicUrl`

### Legacy quest reward config

These routes still exist for backward compatibility, but new owner economy is driven by Zealy XP + lootbox config.

#### `POST /api/brands/:brandId/quests/:questId/reward`
Body:
- `enabled`
- `label`
- `lootKeysDelta`
- `xpMode`
- `xpOverride`

Legacy fields are tolerated:
- `xpDelta`
- `assetPackId`
- `traitUpdates`

#### `GET /api/brands/:brandId/quests/:questId/reward`
Returns:

```json
{ "reward": null }
```

or:

```json
{
  "reward": {
    "zealyQuestId": "quest-id",
    "xpDelta": 0,
    "lootKeysDelta": 1,
    "assetPackId": null,
    "enabled": true,
    "label": "optional",
    "xpMode": "ZEALY",
    "xpOverride": null,
    "traitUpdates": []
  }
}
```

### Legacy lootbox execution route

#### `POST /api/brands/:brandId/lootbox/open`
Legacy brand-scoped lootbox route. Still present, but owner flow should use `/api/me/open-lootbox`.

### Billing and credits

#### `GET /api/brands/:brandId/credits`
Returns:

```json
{ "credits": 10.5 }
```

#### `POST /api/brands/:brandId/billing/x402/start`
Starts or completes an x402 top-up flow.

Body:

```json
{ "amount": 10 }
```

Behavior:
- without `payment-signature` header, returns `402` and `PAYMENT-REQUIRED`
- with valid payment payload in non-production dev flow, credits sponsorship balance and returns:

```json
{ "ok": true, "credits": 20.5, "paymentId": "uuid" }
```

### Actions and workflows

#### `GET /api/brands/:brandId/actions`
Returns recent action queue items.

#### `GET /api/brands/:brandId/workflows`
Returns brand and platform-scoped workflow runs.

Each item includes:
- `id`
- `type`
- `workflowName`
- `status`
- `scopeType`
- `wallet`
- `tokenId`
- `requestId`
- `intentId`
- `txIntentId`
- `krnlRequestId`
- `krnlIntentId`
- `krnlExecutionHash`
- `chainTxHash`
- `txHash`
- `stepsJson`
- `error`
- timestamps/retry data

#### `GET /api/brands/:brandId/workflows/:runId`
Returns detailed workflow run payload, including `renderedWorkflowJson`.

#### `POST /api/brands/:brandId/workflows/:runId/poll`
Triggers explicit polling for the run and returns the polling result.

#### `POST /api/brands/:brandId/workflows/:runId/retry`
Retries a failed workflow run if its type is supported and preconditions still allow a retry.

Returns:

```json
{
  "ok": true,
  "runId": "uuid",
  "requestId": "uuid-or-null",
  "intentId": "0x... or null",
  "txIntentId": "0x... or null",
  "krnlIntentId": "0x... or null"
}
```

## Workflow Detail API

### `GET /api/workflows/:runId`
Auth required.

Returns a brand-admin-visible workflow detail object by run id.

This is useful when the UI only has a workflow run id and not the enclosing brand route.

## Zealy Webhooks

### `POST /api/zealy/webhook`
Public endpoint.

Behavior:
- resolves brand by `communityId`
- verifies `x-zealy-webhook-secret` / `x-zealy-signature` / `x-webhook-secret` if configured
- deduplicates by `zealyEventId`
- ignores non-completion events
- resolves wallet + quest id
- ensures base NFT minted
- updates XP / loot key ledgers

Returns:

```json
{ "ok": true }
```

### `POST /api/zealy/webhook/:brandId`
Same general behavior, but brand is provided explicitly in the route.

## Internal API

Internal routes require:
- `X-Internal-Api-Key`

### `POST /api/internal/zealy-events/:id/process`
Processes a stored Zealy event by id.

Returns:

```json
{ "ok": true, "txHash": "0x... or null" }
```

### `GET /api/internal/nft/base-uri`
Reads contract `metadataBaseURI()` on-chain and compares it to configured global metadata base URI.

Returns:

```json
{
  "onchainBaseUri": "https://...",
  "expectedGlobalMetadataBaseUri": "https://...",
  "matches": true
}
```

## Billing Webhook

### `POST /api/billing/x402/webhook`
Public callback for billing reconciliation.

Body:
- `paymentId`
- `brandId`
- `amount`
- `status`

On success:
- marks payment completed
- increments brand sponsorship credits

Returns:

```json
{ "ok": true }
```

## Dev-only API

These routes are mounted only when `NODE_ENV !== "production"`.

### `POST /api/dev/brands/:brandId/setup-sepolia`
Seeds Sepolia NFT config using `DEFAULT_NFT_CONTRACT_ADDRESS` and `SEPOLIA_RPC_URL`.

### `GET /api/dev/krnl/ping`
Checks KRNL node connectivity.

### `POST /api/dev/brands/:brandId/nft/contract`
Quick dev route to set NFT contract address.

Body:

```json
{ "contractAddress": "0x..." }
```

### `POST /api/dev/brands/:brandId/rewards/trigger`
Manual quest reward trigger for development.

Body:
- `walletAddress`
- `zealyQuestId`
- `userSignature`
- optional transaction intent fields

### `POST /api/dev/simulate/quest-completed`
Creates or reuses a Zealy event and runs reward processing.

Body:

```json
{
  "brandId": "uuid",
  "wallet": "0x...",
  "zealyQuestId": "quest-id",
  "status": "completed"
}
```

## Notes on Current Behavior

- Object-storage-backed URLs are returned as public URLs using `getPublicUrl(...)`.
- Owner lootbox flow is off-chain for unlock persistence and on-chain for workflow submission.
- If `DEMO_MODE=true`, KRNL submission paths can return accepted/demo workflow runs without calling KRNL.
- The active asset pack drives both owner trait image resolution and public render composition.
- `weight` in a loot table entry controls weighted random selection probability. Higher weight means higher chance of being picked.
