type Args = {
  baseUrl: string;
  brandId: string;
  wallet: string;
  zealyQuestId: string;
  authToken: string;
};

const argv = process.argv.slice(2);
const argMap = new Map<string, string>();
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = argv[i + 1];
  if (next && !next.startsWith("--")) {
    argMap.set(key, next);
    i += 1;
  } else {
    argMap.set(key, "true");
  }
}

const baseUrl = argMap.get("base-url") || process.env.BASE_URL || "http://localhost:3000";
const brandId = argMap.get("brand-id") || process.env.BRAND_ID || "";
const wallet = argMap.get("wallet") || process.env.TEST_WALLET || "";
const zealyQuestId = argMap.get("zealy-quest-id") || process.env.ZEALY_QUEST_ID || "";
const authToken = argMap.get("auth-token") || process.env.AUTH_TOKEN || "";

const args: Args = { baseUrl, brandId, wallet, zealyQuestId, authToken };

const logStep = (message: string) => {
  console.log(`\n==> ${message}`);
};

const logOk = (message: string) => {
  console.log(`✔ ${message}`);
};

const logFail = (message: string) => {
  console.error(`✖ ${message}`);
};

const assertInput = () => {
  const missing: string[] = [];
  if (!args.brandId) missing.push("BRAND_ID");
  if (!args.wallet) missing.push("TEST_WALLET");
  if (!args.zealyQuestId) missing.push("ZEALY_QUEST_ID");
  if (!args.authToken) missing.push("AUTH_TOKEN");
  if (missing.length > 0) {
    logFail(`Missing required inputs: ${missing.join(", ")}`);
    process.exit(1);
  }
};

const buildUrl = (path: string) => new URL(path, args.baseUrl).toString();

const authHeaders = () => ({
  Authorization: `Bearer ${args.authToken}`
});

const fetchJson = async <T>(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Promise<T> => {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    ...options.headers
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${text}`);
  }
  return data as T;
};

const fetchRaw = async (absoluteUrl: string) => {
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${absoluteUrl}`);
  }
  return response;
};

const tinyPngBuffer = () => {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0/7GQAAAAASUVORK5CYII=";
  return Buffer.from(base64, "base64");
};

const uploadAsset = async (argsInput: {
  packId: string;
  kind: "base" | "state";
  traitName?: string;
  traitValue?: string;
  fileName: string;
}) => {
  const FormDataCtor = (globalThis as any).FormData;
  const BlobCtor = (globalThis as any).Blob;
  if (!FormDataCtor || !BlobCtor) {
    throw new Error("FormData/Blob not available in this Node runtime.");
  }
  const form = new FormDataCtor();
  const pngBuffer = tinyPngBuffer();
  form.append("file", new BlobCtor([pngBuffer], { type: "image/png" }), argsInput.fileName);
  form.append("kind", argsInput.kind);
  if (argsInput.kind === "state") {
    form.append("traitName", argsInput.traitName ?? "RARITY");
    form.append("traitValue", argsInput.traitValue ?? "1");
  }

  const response = await fetch(
    buildUrl(`/api/brands/${args.brandId}/nft/asset-packs/${argsInput.packId}/upload`),
    {
      method: "POST",
      headers: {
        ...authHeaders()
      },
      body: form as any
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Upload failed ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const findQuest = (quests: Array<{ id: string; zealyQuestId: string }>, questId: string) => {
  return quests.find((quest) => quest.zealyQuestId === questId) || null;
};

const findRun = (
  runs: Array<{ id: string; type: string; wallet: string; tokenId?: string | null }>,
  type: string,
  walletAddress: string
) => {
  return runs.find((run) => run.type === type && run.wallet?.toLowerCase() === walletAddress.toLowerCase())
    || null;
};

const main = async () => {
  assertInput();
  const start = Date.now();
  let pass = true;

  try {
    logStep("Setup Sepolia NFT config (dev endpoint)");
    await fetchJson(`/api/dev/brands/${args.brandId}/setup-sepolia`, {
      method: "POST",
      headers: authHeaders()
    });
    logOk("Sepolia config set");

    logStep("Ensure Zealy config (dummy) and sync quests");
    await fetchJson(`/api/brands/${args.brandId}/zealy`, {
      method: "POST",
      headers: authHeaders(),
      body: { subdomain: `dev-${args.brandId}`, apiKey: "dev" }
    });
    await fetchJson(`/api/brands/${args.brandId}/zealy/sync-quests`, {
      method: "POST",
      headers: authHeaders()
    });
    logOk("Zealy sync complete");

    logStep("Fetch quests and ensure reward rule");
    const quests = await fetchJson<Array<{ id: string; zealyQuestId: string }>>(
      `/api/brands/${args.brandId}/quests`,
      { headers: authHeaders() }
    );
    const quest = findQuest(quests, args.zealyQuestId);
    if (!quest) {
      throw new Error(`Quest not found for zealyQuestId=${args.zealyQuestId}`);
    }
    await fetchJson(`/api/brands/${args.brandId}/quests/${quest.id}/reward`, {
      method: "POST",
      headers: authHeaders(),
      body: {
        xpDelta: 10,
        lootKeysDelta: 1,
        traitUpdates: [{ key: "RARITY", value: "1" }]
      }
    });
    logOk("Reward rule set");

    logStep("Ensure asset pack exists and active");
    let packs = await fetchJson<Array<{ id: string; name: string }>>(
      `/api/brands/${args.brandId}/nft/asset-packs`,
      { headers: authHeaders() }
    );
    if (packs.length === 0) {
      await fetchJson(`/api/brands/${args.brandId}/nft/asset-packs`, {
        method: "POST",
        headers: authHeaders(),
        body: {
          name: "Smoke Pack",
          description: "E2E smoke pack"
        }
      });
      packs = await fetchJson<Array<{ id: string; name: string }>>(
        `/api/brands/${args.brandId}/nft/asset-packs`,
        { headers: authHeaders() }
      );
    }
    const pack = packs[0];
    if (!pack) {
      throw new Error("No asset pack found or created");
    }

    const config = await fetchJson<{
      contractAddress: string;
      chainId: number;
      rpcUrl: string;
      activeAssetPackId?: string | null;
      metadataBaseURI?: string | null;
    }>(`/api/brands/${args.brandId}/nft/contract`, { headers: authHeaders() });

    if (config.activeAssetPackId !== pack.id) {
      await fetchJson(`/api/brands/${args.brandId}/nft/contract`, {
        method: "POST",
        headers: authHeaders(),
        body: {
          contractAddress: config.contractAddress,
          chainId: config.chainId,
          rpcUrl: config.rpcUrl,
          activeAssetPackId: pack.id,
          metadataBaseURI: config.metadataBaseURI ?? undefined
        }
      });
    }
    logOk("Asset pack active");

    logStep("Ensure base and RARITY:1 assets uploaded");
    const assets = await fetchJson<{
      packId: string;
      assets: Array<{ kind: string; traitName?: string | null; traitValue?: string | null }>;
    }>(`/api/brands/${args.brandId}/nft/asset-packs/${pack.id}/assets`, { headers: authHeaders() });

    const hasBase = assets.assets.some((asset) => asset.kind === "base");
    const hasRarity = assets.assets.some(
      (asset) => asset.kind === "state" && asset.traitName === "RARITY" && asset.traitValue === "1"
    );
    if (!hasBase) {
      await uploadAsset({ packId: pack.id, kind: "base", fileName: "base.png" });
    }
    if (!hasRarity) {
      await uploadAsset({
        packId: pack.id,
        kind: "state",
        traitName: "RARITY",
        traitValue: "1",
        fileName: "rarity_1.png"
      });
    }
    logOk("Assets ready");

    logStep("Simulate quest completion (dev endpoint)");
    const simulate = await fetchJson<{ ok: boolean; eventId: string; txHash?: string | null }>(
      `/api/dev/simulate/quest-completed`,
      {
        method: "POST",
        headers: authHeaders(),
        body: {
          brandId: args.brandId,
          wallet: args.wallet,
          zealyQuestId: args.zealyQuestId,
          status: "completed"
        }
      }
    );
    logOk(`Simulated quest completion (eventId=${simulate.eventId})`);

    logStep("Validate workflow runs + txHash");
    const runs = await fetchJson<
      Array<{ id: string; type: string; status: string; wallet: string; tokenId?: string | null }>
    >(`/api/brands/${args.brandId}/workflows`, { headers: authHeaders() });

    const mintRun = findRun(runs, "mint", args.wallet);
    const rewardRun = findRun(runs, "quest_reward", args.wallet);
    if (!mintRun) throw new Error("Mint workflow run not found");
    if (!rewardRun) throw new Error("Quest reward workflow run not found");

    const mintPoll = await fetchJson<{ ok: true; txHash: string }>(
      `/api/brands/${args.brandId}/workflows/${mintRun.id}/poll`,
      { method: "POST", headers: authHeaders() }
    );
    const rewardPoll = await fetchJson<{ ok: true; txHash: string }>(
      `/api/brands/${args.brandId}/workflows/${rewardRun.id}/poll`,
      { method: "POST", headers: authHeaders() }
    );
    logOk(`Mint txHash=${mintPoll.txHash}`);
    logOk(`Reward txHash=${rewardPoll.txHash}`);

    const tokenId = rewardRun.tokenId;
    if (!tokenId) {
      throw new Error("Quest reward workflow missing tokenId");
    }

    logStep("Fetch metadata and image");
    const metadata = await fetchJson<{ image?: string }>(`/metadata/${args.brandId}/${tokenId}`);
    if (!metadata.image) {
      throw new Error("Metadata missing image URL");
    }
    await fetchRaw(metadata.image);
    logOk("Metadata and image fetched");

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nPASS: E2E smoke test completed in ${elapsed}s`);
  } catch (error) {
    pass = false;
    logFail((error as Error).message);
    console.error(error);
  }

  if (!pass) {
    console.log("\nFAIL: E2E smoke test failed");
    process.exit(1);
  }
};

main().catch((error) => {
  logFail((error as Error).message);
  process.exit(1);
});
