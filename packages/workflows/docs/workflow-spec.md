# Workflow Spec (Current)

Active Sepolia KRNL workflows:
- `mint-base-nft`
- `open-lootbox`
- `activate-traits`
- `set-trait-metadata-uri`

All workflows:
- use one custom `construct-evm` step (`EVM_ENCODER` image)
- include explicit system steps in `workflow.steps`
- keep the system chain `prepare-authdata -> target-calldata -> sca-calldata -> bundle`
- set `target.authData_result` to `${construct-evm.result}`

Contract call signatures:
- `mintBaseNFT((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes),address)`
- `openLootbox((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))`
- `setActiveTraitsAuth((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes),bytes32[],bytes32[])`
- `setTraitMetadataURIAuth((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))`

Backend parameter names used by templates:
- `brandId`
- `to`
- `tokenId`
- `traitKeys`
- `traitValues`
- `traitMetadataUri`
