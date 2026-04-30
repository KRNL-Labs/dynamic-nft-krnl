# Dynamic NFT KRNL Workflows

This package is the single source of truth for KRNL workflow templates used by the API.

## Templates

- `workflows/mint-base-nft.json` and `workflows/mint_base_nft.workflow.json`: mint a base NFT through the global contract.
- `workflows/activate-traits.json` and `workflows/set-active-traits.json`: activate unlocked trait keys and values for an NFT owner.
- `workflows/open-lootbox.json` and `workflows/open_lootbox.workflow.json`: retained lootbox workflow template for deployments that execute lootbox actions through KRNL.
- `workflows/set-trait-metadata-uri.json`: retained administrative workflow for ERC-7496 trait metadata URI updates.

## Backend Parameters

The API renders these templates with the variables already used by the existing workflow renderer, including `to`, `traitKeys`, `traitValues`, `TRANSACTION_INTENT_ID`, `TRANSACTION_INTENT_DEADLINE`, `TRANSACTION_INTENT_DELEGATE`, `USER_SIGNATURE`, `ENV.SENDER_ADDRESS`, `ENV.TARGET_CONTRACT`, and `ENV.ATTESTOR_IMAGE`.

Do not add workflow variables unless the API renderer and calling route are updated together.

## Executor Images

Templates reference pinned KRNL executor images such as `ghcr.io/krnl-labs/executor-encoder-evm@sha256:...`. Keep image pins explicit so deployments are reproducible.

## Validation

Run from the monorepo root:

```sh
pnpm workflows:validate
```

The validator parses every JSON file in `workflows/`, checks `workflow`, `workflow.steps`, and validates required step image fields.
