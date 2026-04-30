# Contributing

Thanks for helping improve Dynamic NFT KRNL.

## Development

1. Install pnpm and Node.js 20 or newer.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env` and fill local placeholder values.
4. Run `pnpm db:migrate`, then `pnpm dev`.

## Pull Requests

- Keep changes scoped and documented.
- Run `pnpm workflows:validate` and `pnpm verify:standalone` before opening a PR.
- Do not commit secrets, local environment files, generated uploads, database files, or build output.

## Code Style

Follow the conventions in the package you are editing. Add tests when changing shared behavior, API contracts, workflow rendering, or smart contracts.
