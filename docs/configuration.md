# Configuration

`.env.example` is the canonical sanitized configuration file.

Backend variables cover server settings, Postgres, CORS, public metadata URLs, demo mode, internal API access, Privy verification, KRNL node and RPC settings, gas settings, S3 or MinIO storage, XP pricing, and Zealy API access.

Frontend variables use the `NEXT_PUBLIC_` prefix and include API base URL, Privy app ID, chain ID, KRNL node URL, Sepolia RPC URL, delegated account address, and platform sender address.

Contract variables include deployer private key, Sepolia RPC URL, Etherscan API key, master and recovery keys, owner address, and delegated account implementation address.

`WORKFLOW_TEMPLATES_DIR` defaults internally to `./packages/workflows/workflows`. Override it only with a path inside this repository.
