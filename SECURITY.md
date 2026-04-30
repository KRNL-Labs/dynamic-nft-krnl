# Security

Report security issues privately to the maintainers. Do not open public issues for vulnerabilities.

Never commit private keys, JWT signing material, Privy secrets, Pimlico keys, KRNL sender keys, Infura keys, Zealy API keys, MinIO credentials, or `.env` files. Use `.env.example` placeholders for documentation.

Demo mode is for local evaluation only. Production deployments must use real authentication, HTTPS, managed secrets, least-privilege object storage credentials, and a carefully controlled hot-wallet or delegated-account strategy.
