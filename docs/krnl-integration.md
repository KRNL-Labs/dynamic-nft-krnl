# KRNL Integration

Set `KRNL_NODE_URL`, `KRNL_RPC_METHOD`, `KRNL_RPC_STATUS_METHOD`, chain ID, RPC URL, sender address, delegated account address, attestor URL, bundler URL, paymaster URL, and gas settings in `.env`.

The API creates transaction intent data, signs where configured, renders the selected template, submits to KRNL, stores request or intent identifiers, and polls for status.

Some KRNL status endpoints can return queued or empty responses while work is pending. Treat status polling as eventually consistent and keep workflow run records for reconciliation.
