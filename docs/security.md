# Security

Never commit secrets, local `.env` files, private keys, Privy API keys, Pimlico keys, Infura keys, Zealy API keys, MinIO credentials, JWT material, database files, generated uploads, or logs.

Use separate credentials for development, staging, and production. Restrict S3 buckets, rotate API keys, limit hot-wallet balances, and monitor KRNL workflow submissions.

Demo mode is intentionally permissive for local evaluation and must be disabled in production.
