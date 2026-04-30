# Quickstart

Prerequisites: Node.js 20, pnpm, Docker, and Docker Compose.

```sh
pnpm install
cp .env.example .env
docker compose up -d postgres minio
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000` for the portal UI and `http://localhost:8000/api/health` for the API health check.

For a local demo, keep `DEMO_MODE=true`. Fill Privy and RPC values when testing real login or KRNL paths.
