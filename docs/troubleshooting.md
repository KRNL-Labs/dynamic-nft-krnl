# Troubleshooting

- Wallet required: confirm the user has authenticated through Privy and connected a wallet.
- Portal not selected or wrong portal: brand routes require brand portal; owner routes require owner portal.
- S3 `NoSuchBucket`: create `S3_BUCKET` in MinIO/S3 and confirm endpoint, credentials, and path-style behavior.
- KRNL queued or empty status response: keep polling and verify `KRNL_RPC_STATUS_METHOD` and node URL.
- Missing env vars: compare local `.env` with `.env.example`.
- CORS: set `CORS_ORIGIN` to the web app origin.
- Asset images not rendering: check `S3_PUBLIC_BASE_URL`, uploaded object paths, and browser access to MinIO/S3.
- Loot table validation: ensure every weighted entry has a positive weight and matching asset trait keys.
