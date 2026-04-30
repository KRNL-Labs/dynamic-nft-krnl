# Contracts

Contracts live in `packages/contracts`.

`QuestProgressNFT` is the global ERC-721 contract for all brands. ERC-7496 interfaces expose trait metadata and active trait state. `TargetBase` and the included interfaces support KRNL-authorized execution paths. Deployment scripts include EIP-7702 and delegated-account related configuration where present.

Compile and test:

```sh
pnpm contracts:compile
pnpm contracts:test
```
