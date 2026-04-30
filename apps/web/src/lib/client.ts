import { apiFetch, apiFetchRaw, apiUpload, isApiError } from "./api";
import {
  AssetPack,
  AssetPackAsset,
  Brand,
  Credits,
  MetadataPreview,
  NftConfig,
  LootboxConfig,
  LootboxTableRow,
  Quest,
  RewardRule,
  SystemConfig,
  TraitSchemaItem,
  UserTrait,
  ZealyEvent,
  WorkflowDetail,
  WorkflowRun,
  PortalInfo,
} from "@/types";

type OwnerTraitsResponse =
  | UserTrait[]
  | {
      traits?: UserTrait[];
      items?: UserTrait[];
      data?: UserTrait[];
      unlocked?: UserTrait[];
      active?: UserTrait[];
      lootKeysBalance?: number;
      lootKeys?: number;
    };

function traitIdentity(trait: UserTrait): string {
  if (typeof trait.id === "string" && trait.id.length > 0) return trait.id;
  if (typeof trait.traitId === "string" && trait.traitId.length > 0) return trait.traitId;
  const key = (trait.traitKey ?? trait.name ?? "").toString().trim().toLowerCase();
  const value = (trait.traitValue ?? trait.value ?? "").toString().trim().toLowerCase();
  return `${key}:${value}`;
}

function normalizeOwnerTraits(data: OwnerTraitsResponse): UserTrait[] {
  if (Array.isArray(data)) return data;

  const directTraits = Array.isArray(data.traits)
    ? data.traits
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.data)
        ? data.data
        : [];

  const unlockedTraits = Array.isArray(data.unlocked) ? data.unlocked : [];
  const activeTraits = Array.isArray(data.active) ? data.active : [];

  const merged = new Map<string, UserTrait>();
  const pushTrait = (trait: UserTrait, forceActive?: boolean) => {
    const id = traitIdentity(trait);
    const prev = merged.get(id) ?? {};
    const next: UserTrait = {
      ...prev,
      ...trait,
      isActive:
        forceActive === true
          ? true
          : Boolean(
              (trait as { isActive?: boolean }).isActive ??
                (prev as { isActive?: boolean }).isActive,
            ),
    };
    merged.set(id, next);
  };

  directTraits.forEach((trait) => pushTrait(trait));
  unlockedTraits.forEach((trait) => pushTrait(trait));
  activeTraits.forEach((trait) => pushTrait(trait, true));

  return Array.from(merged.values());
}

export const client = {
  listMyBrands: async () => {
    const data = await apiFetch<Brand[]>("/api/brands/me");
    return data.map((brand) => ({
      ...brand,
      id: brand.id ?? brand.brandId ?? "",
    }));
  },
  listBrands: async () => {
    const data = await apiFetch<Brand[]>("/api/brands");
    return data.map((brand) => ({
      ...brand,
      id: brand.id ?? brand.brandId ?? "",
    }));
  },
  createBrand: (
    body:
      | {
          name: string;
          description?: string;
          logoUrl?: string;
          primaryChainId?: number | string;
        }
      | FormData,
  ) => {
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return apiUpload<Brand>("/api/brands", body, { method: "POST" });
    }
    return apiFetch<Brand>("/api/brands", { method: "POST", body });
  },
  getBrand: (brandId: string) => apiFetch<Brand>(`/api/brands/${brandId}`),
  connectZealy: (
    brandId: string,
    body: {
      communityId: string;
      apiKey: string;
      webhookSecret?: string;
    },
  ) => apiFetch(`/api/brands/${brandId}/zealy`, { method: "POST", body }),
  syncZealyQuests: (brandId: string) =>
    apiFetch(`/api/brands/${brandId}/zealy/sync-quests`, { method: "POST" }),
  listQuests: async (brandId: string) => {
    const data = await apiFetch<
      | Quest[]
      | { quests?: Quest[]; items?: Quest[]; data?: Quest[] }
    >(`/api/brands/${brandId}/quests`);
    if (Array.isArray(data)) return data;
    return data.quests ?? data.items ?? data.data ?? [];
  },
  listZealyQuests: async (brandId: string) => {
    const data = await apiFetch<
      | Quest[]
      | { quests?: Quest[]; items?: Quest[]; data?: Quest[] }
    >(`/api/brands/${brandId}/zealy/quests`);
    if (Array.isArray(data)) return data;
    return data.quests ?? data.items ?? data.data ?? [];
  },
  getRewardRule: (brandId: string, questId: string) =>
    apiFetch<RewardRule>(`/api/brands/${brandId}/quests/${questId}/reward`),
  setRewardRule: (
    brandId: string,
    questId: string,
    body: RewardRule,
  ) =>
    apiFetch(`/api/brands/${brandId}/quests/${questId}/reward`, {
      method: "POST",
      body,
    }),
  getLootboxConfig: async (brandId: string) => {
    const data = await apiFetch<
      | LootboxConfig
      | { xpPerLootKey?: number }
      | { data?: LootboxConfig }
      | { config?: LootboxConfig }
      | {
          enabled?: boolean;
          xpPerLootKey?: number;
          lootKeysPerOpen?: number;
          xpCostToOpen?: number;
          maxUnlocksPerOpen?: number;
          lootTable?: LootboxTableRow[];
          items?: LootboxTableRow[];
        }
    >(`/api/brands/${brandId}/lootbox/config`);
    if (!data || typeof data !== "object") {
      return {};
    }
    if ("data" in data && data.data) {
      return data.data;
    }
    if ("config" in data && data.config) {
      return data.config;
    }
    if ("xpPerLootKey" in data && typeof data.xpPerLootKey === "number") {
      return data;
    }
    return data;
  },
  setLootboxConfig: (brandId: string, body: LootboxConfig) =>
    apiFetch<{
      ok?: boolean;
      enabled?: boolean;
      xpPerLootKey?: number;
      lootKeysPerOpen?: number;
      xpCostToOpen?: number;
      maxUnlocksPerOpen?: number;
      lootTable?: LootboxTableRow[];
      items?: LootboxTableRow[];
    }>(`/api/brands/${brandId}/lootbox/config`, {
      method: "POST",
      body,
    }),
  listZealyEvents: async (brandId: string) => {
    const data = await apiFetch<
      | ZealyEvent[]
      | { items?: ZealyEvent[]; data?: ZealyEvent[]; events?: ZealyEvent[] }
    >(`/api/brands/${brandId}/zealy/events`);
    if (Array.isArray(data)) return data;
    return data.events ?? data.items ?? data.data ?? [];
  },
  getNftConfig: (brandId: string) =>
    apiFetch<NftConfig>(`/api/brands/${brandId}/nft/contract`),
  setNftConfig: (brandId: string, body: NftConfig) =>
    apiFetch(`/api/brands/${brandId}/nft/contract`, {
      method: "POST",
      body,
    }),
  getRecommendedMetadataBaseUri: async (brandId: string) => {
    const data = await apiFetch<
      | { metadataBaseURI?: string; baseUri?: string; baseURI?: string }
      | string
    >(`/api/brands/${brandId}/nft/metadata-base-uri`);
    if (typeof data === "string") return data;
    return data.metadataBaseURI ?? data.baseUri ?? data.baseURI ?? "";
  },
  getOnchainMetadataBaseUriStatus: (brandId: string) =>
    apiFetch<{
      brandId?: string;
      recommendedBaseURI?: string;
      onchainBaseURI?: string;
      matches?: boolean;
    }>(`/api/brands/${brandId}/nft/metadata-base-uri/onchain`),
  setMetadataBaseUriOnchain: async (
    brandId: string,
    metadataBaseUri?: string,
  ) => {
    const data = await apiFetch<{
      runId?: string;
      workflowRunId?: string;
    }>(`/api/brands/${brandId}/nft/set-metadata-base-uri-onchain`, {
      method: "POST",
      body: metadataBaseUri ? { metadataBaseUri } : undefined,
    });
    return { runId: data.runId ?? data.workflowRunId };
  },
  listAssetPacks: async (brandId: string) => {
    const data = await apiFetch<
      | AssetPack[]
      | { items?: AssetPack[]; assetPacks?: AssetPack[]; data?: AssetPack[] }
    >(`/api/brands/${brandId}/nft/asset-packs`);
    if (Array.isArray(data)) return data;
    const packs =
      data.assetPacks ?? data.items ?? data.data ?? [];
    if (!Array.isArray(packs)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[client.listAssetPacks] unexpected response", data);
      }
      return [];
    }
    return packs;
  },
  createAssetPack: (
    brandId: string,
    body: {
      name: string;
      description?: string;
    },
  ) =>
    apiFetch<AssetPack>(`/api/brands/${brandId}/nft/asset-packs`, {
      method: "POST",
      body,
    }),
  uploadAsset: (brandId: string, packId: string, formData: FormData) =>
    apiUpload(
      `/api/brands/${brandId}/nft/asset-packs/${packId}/upload`,
      formData,
      {
        method: "POST",
      },
    ),
  listPackAssets: async (brandId: string, packId: string) => {
    const data = await apiFetch<
      | AssetPackAsset[]
      | { items?: unknown[]; assets?: unknown[]; data?: unknown[] }
    >(`/api/brands/${brandId}/nft/asset-packs/${packId}/assets`);

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.assets)
          ? data.assets
          : Array.isArray(data.data)
            ? data.data
            : [];

    if (!Array.isArray(list)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[client.listPackAssets] unexpected response", data);
      }
      return [];
    }

    return list
      .map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const asset = raw as Record<string, unknown>;
        const nested =
          (asset.asset as Record<string, unknown> | undefined) ??
          (asset.item as Record<string, unknown> | undefined) ??
          (asset.data as Record<string, unknown> | undefined) ??
          (asset.metadata as Record<string, unknown> | undefined) ??
          (asset.file as Record<string, unknown> | undefined) ??
          (asset.object as Record<string, unknown> | undefined) ??
          asset;

        const objectKey =
          (nested.objectKey as string | undefined) ??
          (nested.object_key as string | undefined) ??
          (nested.key as string | undefined) ??
          (nested.s3Key as string | undefined) ??
          (nested.s3_key as string | undefined) ??
          (nested.path as string | undefined) ??
          (nested.filePath as string | undefined) ??
          (asset.objectKey as string | undefined) ??
          (asset.object_key as string | undefined) ??
          (asset.key as string | undefined);

        const publicUrl =
          (nested.publicUrl as string | undefined) ??
          (nested.publicURL as string | undefined) ??
          (nested.public_url as string | undefined) ??
          (nested.url as string | undefined) ??
          (asset.publicUrl as string | undefined) ??
          (asset.publicURL as string | undefined) ??
          (asset.public_url as string | undefined) ??
          (asset.url as string | undefined);

        const traitName =
          (nested.traitName as string | undefined) ??
          (nested.trait_name as string | undefined) ??
          (nested.traitKey as string | undefined) ??
          (asset.traitName as string | undefined) ??
          (asset.trait_name as string | undefined) ??
          (asset.traitKey as string | undefined);

        const traitValue =
          (nested.traitValue as string | number | undefined) ??
          (nested.trait_value as string | number | undefined) ??
          (asset.traitValue as string | number | undefined) ??
          (asset.trait_value as string | number | undefined);

        const kind =
          (nested.kind as string | undefined) ??
          (nested.type as string | undefined) ??
          (asset.kind as string | undefined) ??
          (asset.type as string | undefined);

        return {
          id:
            (asset.id as string | undefined) ??
            (nested.id as string | undefined),
          kind,
          traitName,
          traitValue,
          objectKey,
          publicUrl,
        } as AssetPackAsset;
      })
      .filter((item): item is AssetPackAsset => Boolean(item));
  },
  listWorkflows: async (brandId: string) => {
    const data = await apiFetch<
      | WorkflowRun[]
      | { items?: WorkflowRun[]; data?: WorkflowRun[]; workflows?: WorkflowRun[] }
    >(`/api/brands/${brandId}/workflows`);
    if (Array.isArray(data)) return data;
    const runs = data.workflows ?? data.items ?? data.data ?? [];
    if (!Array.isArray(runs)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[client.listWorkflows] unexpected response", data);
      }
      return [];
    }
    return runs.map((run) => {
      const typed = run as WorkflowRun & { id?: string };
      const resolvedId = typed.id ?? typed.runId ?? "";
      const requestId =
        typed.requestId ?? typed.krnlRequestId ?? typed.requestId;
      const intentId =
        typed.intentId ?? typed.krnlIntentId ?? typed.intentId;
      return { ...typed, runId: resolvedId, requestId, intentId };
    });
  },
  getWorkflowDetail: async (brandId: string, runId: string) => {
    const data = await apiFetch<WorkflowDetail>(
      `/api/brands/${brandId}/workflows/${runId}`,
    );
    const requestId = data.requestId ?? data.krnlRequestId ?? data.requestId;
    const intentId = data.intentId ?? data.krnlIntentId ?? data.intentId;
    return { ...data, requestId, intentId };
  },
  verifyWorkflowRun: (brandId: string, runId: string) =>
    apiFetch<{ ok?: boolean }>(
      `/api/brands/${brandId}/workflows/${runId}/verify-now`,
      { method: "POST" },
    ),
  retryWorkflowRun: (brandId: string, runId: string) =>
    apiFetch<{ ok?: boolean; runId?: string; krnlRunRef?: string }>(
      `/api/brands/${brandId}/workflows/${runId}/retry`,
      { method: "POST" },
    ),
  getCredits: (brandId: string) =>
    apiFetch<Credits>(`/api/brands/${brandId}/credits`),
  previewMetadata: async (brandId: string, tokenId: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
    const response = await apiFetchRaw(
      `${baseUrl}/metadata/${brandId}/${tokenId}`,
      { requireWallet: false },
    );
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const message =
        (typeof data === "object" && data && "message" in data
          ? (data as { message?: string }).message
          : null) ||
        (typeof data === "object" && data && "error" in data
          ? (data as { error?: string }).error
          : null) ||
        (typeof data === "string" ? data : null) ||
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    return data as MetadataPreview;
  },
  startTopUp: (brandId: string, amount: number) =>
    apiFetch(`/api/brands/${brandId}/billing/x402/start`, {
      method: "POST",
      body: { amount },
    }),
  getSystemConfig: () =>
    apiFetch<SystemConfig>("/api/system/config", { requireWallet: false }),
  setGlobalMetadataBaseUriOnchain: async (metadataBaseUri?: string) => {
    const data = await apiFetch<{ runId?: string; workflowRunId?: string }>(
      "/api/admin/nft/set-global-metadata-base-uri-onchain",
      {
        method: "POST",
        body: metadataBaseUri ? { metadataBaseUri } : undefined,
      },
    );
    return { runId: data.runId ?? data.workflowRunId };
  },
  getUserProfile: (brandId?: string) =>
    apiFetch<{
      xp?: number;
      lootKeys?: number;
      tokenId?: string | number;
      brandId?: string;
      activeBrandId?: string;
      brand?: { id?: string };
    }>(
      brandId ? `/api/me?brandId=${encodeURIComponent(brandId)}` : "/api/me",
    ),
  getOwnerBrands: async () => {
    const data = await apiFetch<
      Brand[] | { items?: Brand[]; brands?: Brand[]; data?: Brand[] }
    >("/api/me/brands");
    if (Array.isArray(data)) return data;
    return data.brands ?? data.items ?? data.data ?? [];
  },
  selectOwnerBrand: (brandId: string) =>
    apiFetch<{ ok?: boolean }>(`/api/me/brands/${brandId}/select`, {
      method: "POST",
    }),
  joinOwnerBrand: (brandId: string) =>
    apiFetch<{ ok?: boolean; message?: string }>(
      `/api/me/brands/${brandId}/join`,
      { method: "POST" },
    ),
  getZealyXp: (brandId: string) =>
    apiFetch<{
      xp?: number;
      totalXp?: number;
      xpTotal?: number;
      spentXp?: number;
      xpSpent?: number;
      availableXp?: number;
      xpAvailable?: number;
      xpPerLootKey?: number;
      lootKeysPerOpen?: number;
    }>(
      `/api/me/xp?brandId=${encodeURIComponent(brandId)}`,
    ),
  getOwnerBalances: (brandId: string) =>
    apiFetch<{
      xpBalance?: number;
      lootKeysBalance?: number;
      xp?: number;
      lootKeys?: number;
      tokenId?: string | number;
    }>(`/api/me/balances?brandId=${encodeURIComponent(brandId)}`),
  getOwnerActiveAssetPack: (brandId: string) =>
    apiFetch<{
      id?: string;
      packId?: string;
      name?: string;
      baseImageUrl?: string;
      previewImageUrl?: string;
      layers?: Array<{
        traitName?: string;
        traitValue?: string;
        publicUrl?: string;
        url?: string;
      }>;
      assets?: Array<{
        traitName?: string;
        traitValue?: string;
        kind?: string;
        publicUrl?: string;
        url?: string;
      }>;
      items?: Array<{
        traitName?: string;
        traitValue?: string;
        kind?: string;
        publicUrl?: string;
        url?: string;
      }>;
    }>(`/api/me/brands/${encodeURIComponent(brandId)}/asset-pack/active`),
  buyLootKeys: async (payload: { brandId: string; quantity: number }) => {
    const buyPayload = {
      brandId: payload.brandId,
      qty: payload.quantity,
      quantity: payload.quantity,
    };
    try {
      return await apiFetch<{
        spentXp?: number;
        lootKeys?: number;
        newLootKeys?: number;
        newBalance?: number;
        balance?: number;
        xpAvailable?: number;
        xpRemaining?: number;
      }>("/api/me/lootkeys/buy", {
        method: "POST",
        body: buyPayload,
      });
    } catch (err) {
      if (isApiError(err) && (err.status === 404 || err.status === 405)) {
        return apiFetch<{
          spentXp?: number;
          lootKeys?: number;
          newLootKeys?: number;
          newBalance?: number;
          balance?: number;
          xpAvailable?: number;
          xpRemaining?: number;
        }>("/api/me/lootkeys/purchase", {
          method: "POST",
          body: buyPayload,
        });
      }
      throw err;
    }
  },
  purchaseLootKeys: (payload: { brandId: string; quantity: number }) =>
    client.buyLootKeys(payload),
  listUserRuns: async (brandId?: string) => {
    const path = brandId
      ? `/api/me/runs?brandId=${encodeURIComponent(brandId)}`
      : "/api/me/runs";
    const data = await apiFetch<
      | WorkflowRun[]
      | { items?: WorkflowRun[]; data?: WorkflowRun[]; runs?: WorkflowRun[] }
    >(path);
    if (Array.isArray(data)) return data;
    return data.runs ?? data.items ?? data.data ?? [];
  },
  getTraitSchema: async () => {
    const data = await apiFetch<
      | TraitSchemaItem[]
      | { traits?: TraitSchemaItem[]; items?: TraitSchemaItem[]; data?: TraitSchemaItem[] }
    >("/api/traits/schema");
    if (Array.isArray(data)) return data;
    return data.traits ?? data.items ?? data.data ?? [];
  },
  getUserRunDetail: (runId: string) =>
    apiFetch<WorkflowDetail>(`/api/me/runs/${runId}`),
  openLootbox: (brandId: string) =>
    apiFetch<{
      runId?: string;
      workflowRunId?: string;
      requestId?: string;
      state?: string;
      status?: string;
      txHash?: string;
      chainTxHash?: string;
      unlockedTraits?: Array<Record<string, unknown>>;
      traits?: Array<Record<string, unknown>>;
    }>(
      "/api/me/open-lootbox",
      { method: "POST", body: { brandId } },
    ),
  listUserTraits: async (brandId?: string) => {
    const path = brandId
      ? `/api/me/traits?brandId=${encodeURIComponent(brandId)}`
      : "/api/me/traits";
    const data = await apiFetch<OwnerTraitsResponse>(path);
    return normalizeOwnerTraits(data);
  },
  getOwnerTraitsSnapshot: async (brandId: string) => {
    const data = await apiFetch<OwnerTraitsResponse>(
      `/api/me/traits?brandId=${encodeURIComponent(brandId)}`,
    );
    const traits = normalizeOwnerTraits(data);
    const lootKeysBalance =
      !Array.isArray(data) && typeof data.lootKeysBalance === "number"
        ? data.lootKeysBalance
        : undefined;
    const lootKeys =
      !Array.isArray(data) && typeof data.lootKeys === "number"
        ? data.lootKeys
        : undefined;

    return {
      traits,
      lootKeysBalance,
      lootKeys,
    };
  },
  getOwnerNfts: async (brandId: string) => {
    const data = await apiFetch<
      | Array<Record<string, unknown>>
      | {
          nfts?: Array<Record<string, unknown>>;
          items?: Array<Record<string, unknown>>;
          data?: Array<Record<string, unknown>>;
        }
    >(`/api/me/nfts?brandId=${encodeURIComponent(brandId)}`);
    if (Array.isArray(data)) return data;
    return data.nfts ?? data.items ?? data.data ?? [];
  },
  activateUserTraits: (
    traitSelections: Array<string | { traitKey: string; traitValue: string }>,
    brandId: string,
  ): Promise<{ runId?: string; workflowRunId?: string }> =>
    apiFetch("/api/me/traits/activate", {
      method: "POST",
      body: { brandId, selections: traitSelections },
    }),
  getAuthMe: () =>
    apiFetch<PortalInfo>("/api/auth/me"),
  selectPortal: (payload: { portalType: "brand" | "owner"; brandId?: string }) =>
    apiFetch<PortalInfo>("/api/auth/select-portal", {
      method: "POST",
      body: payload,
    }),
  logout: () =>
    apiFetch<{ ok?: boolean }>("/api/auth/logout", {
      method: "POST",
      requireWallet: false,
    }),
};
