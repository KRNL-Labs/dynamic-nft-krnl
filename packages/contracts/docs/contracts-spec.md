# QuestProgressNFT — Contract Spec

This file defines the **first** contract Codex should implement: `QuestProgressNFT`.

We are **not** adding KRNL cryptography yet.  
We will stub `AuthData` and wire real KRNL verification later.

---

## 1. Overview

`QuestProgressNFT` is a **brand-specific** NFT collection that tracks users’ quest progress and rewards for that brand.

- Standard: **ERC-721** for ownership.
- Dynamic traits: stored using a simple **traits mapping** (key–value, ERC-7496-style).
- A single user **may hold multiple NFTs** from the same brand (contract) if the brand wants:
  - e.g. different NFT lines per quest type, season passes, special drops, etc.
- Two core mutation functions:
  - `applyQuestResult` — applies quest-related trait updates (XP, flags, etc.).
  - `openLootbox` — applies lootbox-related trait updates (cosmetics, rarity, keys, etc.).

In this first version, we **do not** implement real KRNL `AuthData` signature verification.  
All mutation functions are `onlyOwner`, and we leave `// TODO` hooks for future KRNL integration.

---

## 2. External Dependencies

Use OpenZeppelin:

- `@openzeppelin/contracts/token/ERC721/ERC721.sol`
- `@openzeppelin/contracts/access/Ownable.sol`

The contract must live at:

```text
contracts/QuestProgressNFT.sol
````

---

## 3. Data Structures

### 3.1 Trait Storage

We use a simple trait mapping per token:

```solidity
// tokenId => (traitKey => traitValue)
mapping(uint256 => mapping(bytes32 => bytes32)) private _traits;
```

Standard trait keys:

```solidity
bytes32 constant TRAIT_XP        = keccak256("XP");
bytes32 constant TRAIT_LEVEL     = keccak256("LEVEL");
bytes32 constant TRAIT_RARITY    = keccak256("RARITY");
bytes32 constant TRAIT_LOOT_KEYS = keccak256("LOOT_KEYS");
```

Quest completion flags will be arbitrary keys, e.g.:

```solidity
// Off-chain convention, computed the same way in workflows
bytes32 questKey = keccak256(abi.encodePacked("QUEST_", questId));
```

Additional cosmetic traits (like `SKIN_ID`, `AURA_ID`) can be added later as more keys.

---

### 3.2 KRNL Payload Structs (Stub Only)

These structs define the payload shapes we decode from `AuthData.result`.
We **do not** verify signatures yet.

```solidity
struct TraitUpdate {
    bytes32 key;
    bytes32 value;
}

struct QuestResult {
    uint256 tokenId;
    uint256 questId;        // internal or Zealy quest ID
    uint256 xpDelta;        // XP gained from this quest
    TraitUpdate[] traits;   // traits to update (XP, LEVEL, quest flags, LOOT_KEYS, etc.)
}

struct LootboxResult {
    uint256 tokenId;
    TraitUpdate[] traits;   // traits to update (e.g. cosmetics, rarity, LOOT_KEYS decrement)
}

struct AuthData {
    bytes result;     // abi.encode(QuestResult) OR abi.encode(LootboxResult)
    bytes signature;  // TODO: verify this in KRNL integration
}
```

For now, the contract will:

* Decode `auth.result` into `QuestResult` / `LootboxResult`.
* Ignore `auth.signature` (just leave a `// TODO`).

---

## 4. State Variables

```solidity
uint256 private _nextTokenId;
```

* Simple auto-increment token ID:

  * First minted token uses ID 1.
  * Increment `_nextTokenId` on every mint.

We **do not** track `tokenIdOf[user]` because we now allow multiple NFTs per wallet for the same brand.

If later we need enumeration, we can:

* Either use `ERC721Enumerable`, or
* Add custom mappings / helpers.

---

## 5. Constructor

```solidity
constructor(string memory name_, string memory symbol_)
    ERC721(name_, symbol_)
{}
```

Initialization requirement:

```solidity
_nextTokenId = 1;
```

(You can set this directly in the constructor.)

---

## 6. Public / External Functions

### 6.1 `mintBaseNFT`

```solidity
function mintBaseNFT(address to) external onlyOwner returns (uint256 tokenId);
```

**Behavior:**

1. Mint a new token:

```solidity
tokenId = _nextTokenId;
_nextTokenId++;
_safeMint(to, tokenId);
```

2. Initialize base traits for this token:

```solidity
_traits[tokenId][TRAIT_XP]        = bytes32(uint256(0));
_traits[tokenId][TRAIT_LEVEL]     = bytes32(uint256(1));
_traits[tokenId][TRAIT_RARITY]    = bytes32(uint256(0));
_traits[tokenId][TRAIT_LOOT_KEYS] = bytes32(uint256(0));
```

3. Emit:

```solidity
event BaseNFTMinted(address indexed user, uint256 indexed tokenId);
```

* No restriction on “one per user per brand” in the contract — that rule will be enforced in backend / KRNL logic if needed.

---

### 6.2 `applyQuestResult`

```solidity
function applyQuestResult(AuthData calldata auth) external onlyOwner;
```

**Behavior:**

1. Decode the quest result:

```solidity
QuestResult memory r = abi.decode(auth.result, (QuestResult));
```

2. Verify that `r.tokenId` exists:

```solidity
require(_exists(r.tokenId), "Token does not exist");
```

3. Apply all `TraitUpdate` entries:

```solidity
for (uint256 i = 0; i < r.traits.length; i++) {
    TraitUpdate memory u = r.traits[i];
    _traits[r.tokenId][u.key] = u.value;
}
```

4. Emit:

```solidity
event QuestApplied(
    address indexed user,
    uint256 indexed tokenId,
    uint256 indexed questId,
    uint256 xpDelta
);
```

Where:

* `user = ownerOf(r.tokenId)`
* `tokenId = r.tokenId`
* `questId = r.questId`
* `xpDelta = r.xpDelta`

5. Leave a TODO for future KRNL validation:

```solidity
// TODO: verify auth.signature with KRNL signer / delegated account
```

---

### 6.3 `openLootbox`

```solidity
function openLootbox(AuthData calldata auth) external onlyOwner;
```

**Behavior:**

1. Decode:

```solidity
LootboxResult memory r = abi.decode(auth.result, (LootboxResult));
```

2. Verify the token exists:

```solidity
require(_exists(r.tokenId), "Token does not exist");
```

3. Apply trait updates:

```solidity
for (uint256 i = 0; i < r.traits.length; i++) {
    TraitUpdate memory u = r.traits[i];
    _traits[r.tokenId][u.key] = u.value;
}
```

4. Emit:

```solidity
event LootboxOpened(
    address indexed user,
    uint256 indexed tokenId,
    bytes lootData
);
```

Where:

* `user = ownerOf(r.tokenId)`
* `tokenId = r.tokenId`
* `lootData = auth.result` (raw payload used to derive changes).

5. Again, leave:

```solidity
// TODO: verify auth.signature with KRNL signer / delegated account
```

---

## 7. View Functions

We need trait accessors:

```solidity
function getTrait(uint256 tokenId, bytes32 key) external view returns (bytes32);
function getUintTrait(uint256 tokenId, bytes32 key) external view returns (uint256);
```

**Behavior:**

* Both MUST revert if the token does not exist:

```solidity
require(_exists(tokenId), "Token does not exist");
```

* `getTrait`:

```solidity
return _traits[tokenId][key];
```

* `getUintTrait`:

```solidity
return uint256(_traits[tokenId][key]);
```

We do **not** enforce or expose any “one per wallet” helper like `tokenIdOf(user)` since that’s no longer correct in the “multi NFT per user per brand” design.

If later you want to easily fetch all tokens for a user, you can:

* Extend the contract with `ERC721Enumerable`, or
* Build indexers off-chain.

---

## 8. Events

Add these events:

```solidity
event BaseNFTMinted(address indexed user, uint256 indexed tokenId);
event QuestApplied(
    address indexed user,
    uint256 indexed tokenId,
    uint256 indexed questId,
    uint256 xpDelta
);
event LootboxOpened(
    address indexed user,
    uint256 indexed tokenId,
    bytes lootData
);
```

---

**END OF FILE – READY TO USE FOR CODEX**