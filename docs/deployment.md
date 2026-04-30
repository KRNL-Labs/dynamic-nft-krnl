# Deployment

Deploy the API with Node.js 20, Postgres, object storage, Privy credentials, KRNL node settings, RPC settings, and a secure sender/delegated account configuration.

Deploy the web app with `NEXT_PUBLIC_API_BASE_URL` pointing at the public API. Configure Privy and chain variables for the frontend.

Deploy contracts from `packages/contracts` after setting deployer, owner, master, recovery, RPC, and verification variables. Update API contract configuration after deployment.

Use managed secrets for every private value. Do not bake secrets into Docker images.
