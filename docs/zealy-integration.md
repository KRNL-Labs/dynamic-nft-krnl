# Zealy Integration

Brand owners connect Zealy with a community ID, API key, and optional webhook secret. Quest sync imports quest data into the platform.

In production, Zealy XP is the source of truth for owner XP and loot key purchasing. In demo mode, owner wallets receive default XP per selected brand and live Zealy calls are not required for the demo flow.

Keep Zealy API keys and webhook secrets in environment-backed secret storage, never in source control.
