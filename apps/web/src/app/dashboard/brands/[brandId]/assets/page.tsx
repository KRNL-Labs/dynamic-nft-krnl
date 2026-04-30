/* eslint-disable @next/next/no-img-element */
"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { apiFetchRaw, isApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { FIXED_TRAIT_NAMES } from "@/lib/trait-layers";
import {
  AssetPack,
  AssetPackAsset,
  Brand,
  MetadataPreview,
  NftConfig,
} from "@/types";

export default function BrandAssetsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [assetPacks, setAssetPacks] = useState<AssetPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [packAssets, setPackAssets] = useState<AssetPackAsset[]>([]);
  const [nftConfig, setNftConfig] = useState<NftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [creatingPack, setCreatingPack] = useState(false);

  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [layerFile, setLayerFile] = useState<File | null>(null);
  const [layerTraitName, setLayerTraitName] = useState("");
  const [layerTraitValue, setLayerTraitValue] = useState("");
  const [uploadingBase, setUploadingBase] = useState(false);
  const [uploadingLayer, setUploadingLayer] = useState(false);

  const [settingActive, setSettingActive] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [tokenId, setTokenId] = useState("");
  const [metadata, setMetadata] = useState<MetadataPreview | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [brokenAssets, setBrokenAssets] = useState<Record<string, boolean>>({});
  const [assetPreviewUrls, setAssetPreviewUrls] = useState<Record<string, string>>(
    {},
  );
  const [fallbackAttempted, setFallbackAttempted] = useState<
    Record<string, boolean>
  >({});
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const s3PublicBaseUrl = process.env.NEXT_PUBLIC_S3_PUBLIC_BASE_URL ?? "";

  const parseBaseUrl = useCallback((baseUrl: string) => {
    if (!baseUrl) return null;
    try {
      const parsed = new URL(baseUrl);
      const basePath = parsed.pathname.replace(/\/+$/, "");
      return {
        origin: parsed.origin,
        basePath: basePath === "/" ? "" : basePath,
      };
    } catch {
      return null;
    }
  }, []);

  const resolveAssetUrl = useCallback(
    (url?: string) => {
      if (!url) return "";
      const cleaned = url.trim();
      if (!cleaned) return "";
      if (
        cleaned.startsWith("http://") ||
        cleaned.startsWith("https://") ||
        cleaned.startsWith("data:")
      ) {
        return encodeURI(cleaned);
      }
      const fallbackBase =
        s3PublicBaseUrl ||
        apiBaseUrl ||
        (typeof window !== "undefined" ? window.location.origin : "");
      if (!fallbackBase) return encodeURI(cleaned);
      const parsed = parseBaseUrl(fallbackBase);
      const path = cleaned.replace(/^\/+/, "");
      if (!parsed) {
        const base = fallbackBase.replace(/\/+$/, "");
        return encodeURI(`${base}/${path}`);
      }
      const basePath = parsed.basePath.replace(/^\/+/, "");
      if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
        return encodeURI(`${parsed.origin}/${path}`);
      }
      const basePrefix = parsed.basePath
        ? `${parsed.origin}${parsed.basePath}`
        : parsed.origin;
      return encodeURI(`${basePrefix}/${path}`);
    },
    [apiBaseUrl, s3PublicBaseUrl, parseBaseUrl],
  );

  const buildPublicUrl = useCallback(
    (objectKey?: string | null) => {
      if (!objectKey || !s3PublicBaseUrl) return "";
      if (
        objectKey.startsWith("http://") ||
        objectKey.startsWith("https://") ||
        objectKey.startsWith("data:")
      ) {
        return objectKey;
      }
      return resolveAssetUrl(objectKey);
    },
    [resolveAssetUrl, s3PublicBaseUrl],
  );

  const handleImageError = useCallback(
    async (assetKey: string, url: string) => {
      if (!url) {
        setBrokenAssets((prev) => ({ ...prev, [assetKey]: true }));
        return;
      }
      if (fallbackAttempted[assetKey]) {
        setBrokenAssets((prev) => ({ ...prev, [assetKey]: true }));
        return;
      }
      setFallbackAttempted((prev) => ({ ...prev, [assetKey]: true }));
      try {
        const response = await apiFetchRaw(url, { requireWallet: false });
        if (!response.ok) {
          throw new Error(`Failed to fetch image (${response.status})`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setAssetPreviewUrls((prev) => ({ ...prev, [assetKey]: objectUrl }));
      } catch {
        setBrokenAssets((prev) => ({ ...prev, [assetKey]: true }));
      }
    },
    [fallbackAttempted],
  );

  const normalizeAssets = useCallback((data: unknown) => {
    let list: unknown[] | null = null;
    if (Array.isArray(data)) {
      list = data;
    } else if (data && typeof data === "object") {
      const typed = data as { items?: unknown; assets?: unknown };
      if (Array.isArray(typed.items)) {
        list = typed.items;
      } else if (Array.isArray(typed.assets)) {
        list = typed.assets;
      }
    }
    if (!list) return null;
    return list.map((raw) => {
      if (!raw || typeof raw !== "object") return {} as AssetPackAsset;
      const asset = raw as Record<string, unknown>;
      const nestedCandidate =
        (asset.asset as Record<string, unknown> | undefined) ??
        (asset.item as Record<string, unknown> | undefined) ??
        (asset.data as Record<string, unknown> | undefined) ??
        (asset.metadata as Record<string, unknown> | undefined) ??
        (asset.file as Record<string, unknown> | undefined) ??
        (asset.object as Record<string, unknown> | undefined);
      const source =
        nestedCandidate && typeof nestedCandidate === "object"
          ? nestedCandidate
          : asset;
      let publicUrl =
        (source.publicUrl as string | undefined) ??
        (source.publicURL as string | undefined) ??
        (source.public_url as string | undefined) ??
        (source.url as string | undefined) ??
        (asset.publicUrl as string | undefined) ??
        (asset.publicURL as string | undefined) ??
        (asset.public_url as string | undefined) ??
        (asset.url as string | undefined);
      const objectKey =
        (source.objectKey as string | undefined) ??
        (source.object_key as string | undefined) ??
        (source.key as string | undefined) ??
        (source.s3Key as string | undefined) ??
        (source.s3_key as string | undefined) ??
        (source.path as string | undefined) ??
        (source.filePath as string | undefined) ??
        (asset.objectKey as string | undefined) ??
        (asset.object_key as string | undefined) ??
        (asset.key as string | undefined);
      if (!publicUrl && objectKey) {
        publicUrl = buildPublicUrl(objectKey);
      }
      return {
        ...(raw as AssetPackAsset),
        publicUrl,
        objectKey,
        id:
          (asset.id as string | undefined) ??
          (source.id as string | undefined),
        traitName:
          (source.traitName as string | undefined) ??
          (source.trait_name as string | undefined) ??
          (asset.traitName as string | undefined) ??
          (asset.trait_name as string | undefined),
        traitValue:
          (source.traitValue as string | number | undefined) ??
          (source.trait_value as string | number | undefined) ??
          (asset.traitValue as string | number | undefined) ??
          (asset.trait_value as string | number | undefined),
        kind:
          (source.kind as string | undefined) ??
          (source.type as string | undefined) ??
          (asset.kind as string | undefined) ??
          (asset.type as string | undefined),
      };
    }) as AssetPackAsset[];
  }, [buildPublicUrl]);

  const handleAuthError = useCallback(
    (err: unknown, clearAssets = false) => {
      if (!isApiError(err)) return false;
      if (err.status === 401) {
        toast.addToast("Unauthorized. Please reconnect.", "error");
      } else if (err.status === 403) {
        toast.addToast("Forbidden.", "error");
      } else {
        return false;
      }
      if (clearAssets) {
        setAssetPacks([]);
        setPackAssets([]);
        setSelectedPackId(null);
      }
      setError(null);
      setAssetsError(null);
      return true;
    },
    [toast],
  );

  const resolveErrorMessage = useCallback((err: unknown, fallback: string) => {
    return err instanceof Error ? err.message : fallback;
  }, []);

  const activePackId = nftConfig?.activeAssetPackId ?? null;
  const selectedPack = useMemo(
    () =>
      (Array.isArray(assetPacks)
        ? assetPacks.find((pack) => pack.id === selectedPackId)
        : null) || null,
    [assetPacks, selectedPackId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandList, brandDetail, packsResponse, config] = await Promise.all([
        client.listMyBrands().catch(() => []),
        client.getBrand(brandId),
        client.listAssetPacks(brandId),
        client.getNftConfig(brandId).catch(() => null),
      ]);
      const packList = Array.isArray(packsResponse) ? packsResponse : [];
      setAssetPacks(packList);
      setBrands(brandList.length ? brandList : brandDetail ? [brandDetail] : []);
      setBrand(brandDetail);
      setNftConfig(config ?? null);
      setSelectedPackId((prev) => {
        if (prev && packList.some((pack) => pack.id === prev)) {
          return prev;
        }
        if (
          config?.activeAssetPackId &&
          packList.some((p) => p.id === config.activeAssetPackId)
        ) {
          return config.activeAssetPackId;
        }
        return packList[0]?.id ?? null;
      });
    } catch (err) {
      if (handleAuthError(err, true)) return;
      const msg = resolveErrorMessage(err, "Failed to load assets");
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [brandId, handleAuthError, resolveErrorMessage, toast]);

  const refreshAssetPacks = useCallback(async () => {
    try {
      const packsResponse = await client.listAssetPacks(brandId);
      const packList = Array.isArray(packsResponse) ? packsResponse : [];
      setAssetPacks(packList);
      setSelectedPackId((prev) => {
        if (prev && packList.some((pack) => pack.id === prev)) {
          return prev;
        }
        if (
          nftConfig?.activeAssetPackId &&
          packList.some((p) => p.id === nftConfig.activeAssetPackId)
        ) {
          return nftConfig.activeAssetPackId;
        }
        return packList[0]?.id ?? null;
      });
    } catch (err) {
      if (handleAuthError(err, true)) return;
      const msg = resolveErrorMessage(err, "Failed to refresh asset packs");
      setAssetsError(msg);
      toast.addToast(msg, "error");
    }
  }, [
    brandId,
    handleAuthError,
    nftConfig?.activeAssetPackId,
    resolveErrorMessage,
    toast,
  ]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.walletAddress) {
      if (!portal.portalReady || portal.portalType !== "brand") return;
      void load();
    }
  }, [auth.isAuthenticated, auth.walletAddress, portal.portalReady, portal.portalType, load]);

  useEffect(() => {
    const fetchAssets = async () => {
      if (!portal.portalReady || portal.portalType !== "brand") return;
      if (!selectedPackId) {
        setPackAssets([]);
        return;
      }
      setAssetsLoading(true);
      setAssetsError(null);
      try {
        const assetsResponse = await client.listPackAssets(
          brandId,
          selectedPackId,
        );
        const normalized = normalizeAssets(assetsResponse);
        if (!normalized) {
          setPackAssets([]);
          setAssetsError("Unexpected assets response");
        } else {
          setPackAssets(normalized);
          setBrokenAssets({});
          setAssetPreviewUrls({});
          setFallbackAttempted({});
        }
      } catch (err) {
        if (handleAuthError(err, true)) return;
        const resolved = resolveErrorMessage(
          err,
          "Failed to load pack assets",
        );
        setAssetsError(resolved);
        toast.addToast(resolved, "error");
      } finally {
        setAssetsLoading(false);
      }
    };
    void fetchAssets();
  }, [
    brandId,
    handleAuthError,
    selectedPackId,
    resolveErrorMessage,
    toast,
    portal.portalReady,
    portal.portalType,
    normalizeAssets,
  ]);

  const handleCreatePack = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!packName.trim()) {
      setError("Asset pack name is required.");
      return;
    }
    setError(null);
    setCreatingPack(true);
    try {
      const created = await client.createAssetPack(brandId, {
        name: packName,
        description: packDescription || undefined,
      });
      toast.addToast("Asset pack created", "success");
      setPackName("");
      setPackDescription("");
      await refreshAssetPacks();
      setSelectedPackId(created.id);
    } catch (err) {
      if (handleAuthError(err)) return;
      const msg = resolveErrorMessage(err, "Failed to create pack");
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setCreatingPack(false);
    }
  };

  const handleSetActive = async () => {
    if (!selectedPackId) return;
    if (!nftConfig?.contractAddress || !nftConfig?.chainId || !nftConfig?.rpcUrl) {
      toast.addToast(
        "NFT config missing. Add contract settings first.",
        "error",
      );
      return;
    }
    setSettingActive(true);
    try {
      await client.setNftConfig(brandId, {
        contractAddress: nftConfig.contractAddress,
        chainId: Number(nftConfig.chainId),
        rpcUrl: nftConfig.rpcUrl,
        activeAssetPackId: selectedPackId,
      });
      setNftConfig({ ...nftConfig, activeAssetPackId: selectedPackId });
      toast.addToast("Active asset pack updated", "success");
    } catch (err) {
      if (handleAuthError(err)) return;
      const msg = resolveErrorMessage(err, "Failed to set active pack");
      toast.addToast(msg, "error");
    } finally {
      setSettingActive(false);
    }
  };

  const handleUploadBase = async () => {
    if (!selectedPackId) return;
    if (!baseFile) {
      setAssetsError("Select a base image to upload.");
      return;
    }
    setUploadingBase(true);
    setAssetsError(null);
    try {
      const formData = new FormData();
      formData.append("file", baseFile);
      formData.append("kind", "base");
      const uploadResponse = await client.uploadAsset(
        brandId,
        selectedPackId,
        formData,
      );
      const objectKey =
        (uploadResponse as { objectKey?: string })?.objectKey ?? null;
      const publicUrl = buildPublicUrl(objectKey);
      if (objectKey && publicUrl) {
        setPackAssets((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [];
          const existingIndex = next.findIndex(
            (asset) => asset.objectKey === objectKey,
          );
          const newAsset: AssetPackAsset = {
            objectKey,
            publicUrl,
            kind: "base",
          };
          if (existingIndex >= 0) {
            next[existingIndex] = { ...next[existingIndex], ...newAsset };
            return next;
          }
          return [newAsset, ...next];
        });
        setAssetPreviewUrls((prev) => ({ ...prev, [objectKey]: publicUrl }));
        setBrokenAssets((prev) => {
          if (!prev[objectKey]) return prev;
          const next = { ...prev };
          delete next[objectKey];
          return next;
        });
      }
      toast.addToast("Base image uploaded", "success");
      setBaseFile(null);
      const assetsResponse = await client.listPackAssets(
        brandId,
        selectedPackId,
      );
      const normalized = normalizeAssets(assetsResponse);
      if (!normalized) {
        setPackAssets([]);
        setAssetsError("Unexpected assets response");
      } else {
        setPackAssets(normalized);
      }
      await refreshAssetPacks();
    } catch (err) {
      if (handleAuthError(err)) return;
      const resolved = resolveErrorMessage(
        err,
        "Failed to upload base image",
      );
      setAssetsError(resolved);
      toast.addToast(resolved, "error");
    } finally {
      setUploadingBase(false);
    }
  };

  const handleUploadLayer = async () => {
    if (!selectedPackId) return;
    if (!layerFile) {
      setAssetsError("Select a trait layer image to upload.");
      return;
    }
    if (!layerTraitName.trim() || !layerTraitValue.trim()) {
      setAssetsError("Trait name and trait value are required.");
      return;
    }
    setUploadingLayer(true);
    setAssetsError(null);
    try {
      const formData = new FormData();
      formData.append("file", layerFile);
      formData.append("kind", "layer");
      formData.append("traitName", layerTraitName.trim());
      formData.append("traitValue", layerTraitValue.trim());
      const uploadResponse = await client.uploadAsset(
        brandId,
        selectedPackId,
        formData,
      );
      const objectKey =
        (uploadResponse as { objectKey?: string })?.objectKey ?? null;
      const publicUrl = buildPublicUrl(objectKey);
      if (objectKey && publicUrl) {
        setPackAssets((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [];
          const existingIndex = next.findIndex(
            (asset) => asset.objectKey === objectKey,
          );
          const newAsset: AssetPackAsset = {
            objectKey,
            publicUrl,
            kind: "layer",
            traitName: layerTraitName.trim(),
            traitValue: layerTraitValue.trim(),
          };
          if (existingIndex >= 0) {
            next[existingIndex] = { ...next[existingIndex], ...newAsset };
            return next;
          }
          return [newAsset, ...next];
        });
        setAssetPreviewUrls((prev) => ({ ...prev, [objectKey]: publicUrl }));
        setBrokenAssets((prev) => {
          if (!prev[objectKey]) return prev;
          const next = { ...prev };
          delete next[objectKey];
          return next;
        });
      }
      toast.addToast("Trait layer uploaded", "success");
      setLayerFile(null);
      const assetsResponse = await client.listPackAssets(
        brandId,
        selectedPackId,
      );
      const normalized = normalizeAssets(assetsResponse);
      if (!normalized) {
        setPackAssets([]);
        setAssetsError("Unexpected assets response");
      } else {
        setPackAssets(normalized);
      }
      await refreshAssetPacks();
    } catch (err) {
      if (handleAuthError(err)) return;
      const resolved = resolveErrorMessage(
        err,
        "Failed to upload trait layer",
      );
      setAssetsError(resolved);
      toast.addToast(resolved, "error");
    } finally {
      setUploadingLayer(false);
    }
  };

  const handlePreviewMetadata = async () => {
    if (!tokenId.trim()) {
      setMetadataError("Enter a token id to preview.");
      return;
    }
    setMetadataLoading(true);
    setMetadataError(null);
    try {
      const preview = await client.previewMetadata(brandId, tokenId.trim());
      setMetadata(preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to preview metadata";
      setMetadataError(msg);
    } finally {
      setMetadataLoading(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Assets</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to manage asset packs.
          </p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Assets</p>
        <h1 className="text-2xl font-bold text-white">Asset Packs</h1>
        <p className="text-sm text-zinc-400">
          Upload base and state images, preview metadata.
        </p>
      </div>
      {loading && (
        <div className="card p-4 text-sm text-zinc-400">Loading...</div>
      )}
      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <form className="card space-y-4 p-5" onSubmit={handleCreatePack}>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              New Pack
            </p>
            <h3 className="text-lg font-semibold text-white">Create Pack</h3>
          </div>
          <div>
            <label className="text-sm text-zinc-300">Name</label>
            <input
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              className="input-dark mt-2"
              required
            />
          </div>
          <div>
            <label className="text-sm text-zinc-300">Description</label>
            <textarea
              value={packDescription}
              onChange={(e) => setPackDescription(e.target.value)}
              rows={2}
              className="input-dark mt-2"
            />
          </div>
          <button className="btn-primary w-full" disabled={creatingPack}>
            {creatingPack ? "Creating..." : "Create Pack"}
          </button>
        </form>

        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Library
              </p>
              <h3 className="text-lg font-semibold text-white">Asset Packs</h3>
            </div>
            <span className="text-xs text-zinc-500">
              {assetPacks.length} total
            </span>
          </div>
          {(!Array.isArray(assetPacks) || assetPacks.length === 0) && (
            <p className="text-sm text-zinc-400">No asset packs yet.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {Array.isArray(assetPacks)
              ? assetPacks.map((pack) => {
                  const isActive = activePackId === pack.id;
                  const isSelected = selectedPackId === pack.id;
                  return (
                    <button
                      key={pack.id}
                      onClick={() => setSelectedPackId(pack.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        isSelected
                          ? "border-red-500/50 bg-red-600/10 text-white"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {pack.name}
                        </span>
                        {isActive && (
                          <span className="rounded-full border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase text-red-300">
                            Active
                          </span>
                        )}
                      </div>
                      {pack.description && (
                        <p className="mt-1 text-xs text-zinc-500">
                          {pack.description}
                        </p>
                      )}
                    </button>
                  );
                })
              : null}
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Selected Pack
              </p>
              <h3 className="text-lg font-semibold text-white">
                {selectedPack?.name || "Select a pack"}
              </h3>
            </div>
            <button
              className="btn-secondary"
              onClick={handleSetActive}
              disabled={
                !selectedPackId ||
                settingActive ||
                activePackId === selectedPackId
              }
            >
              {activePackId === selectedPackId
                ? "Active Pack"
                : "Set as Active Pack"}
            </button>
          </div>
          {selectedPack?.description && (
            <p className="text-sm text-zinc-400">{selectedPack.description}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card space-y-4 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Base
              </p>
              <h4 className="text-base font-semibold text-white">
                Upload Base Image
              </h4>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-secondary cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setBaseFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                Choose File
              </label>
              <span className="text-xs text-zinc-500">
                {baseFile ? baseFile.name : "No file selected"}
              </span>
            </div>
            <button
              className="btn-primary w-full"
              onClick={handleUploadBase}
              disabled={!selectedPackId || uploadingBase}
              type="button"
            >
              {uploadingBase ? "Uploading..." : "Upload Base"}
            </button>
          </div>

          <div className="card space-y-4 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                State
              </p>
              <h4 className="text-base font-semibold text-white">
                Upload Trait Layer
              </h4>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-secondary cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLayerFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                Choose File
              </label>
              <span className="text-xs text-zinc-500">
                {layerFile ? layerFile.name : "No file selected"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-zinc-300">Trait Name</label>
                <select
                  value={layerTraitName}
                  onChange={(e) => setLayerTraitName(e.target.value)}
                  className="input-dark mt-2"
                >
                  <option value="">Select trait</option>
                  {FIXED_TRAIT_NAMES.map((traitName) => (
                    <option key={traitName} value={traitName}>
                      {traitName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-300">Trait Value</label>
                <input
                  value={layerTraitValue}
                  onChange={(e) => setLayerTraitValue(e.target.value)}
                  placeholder="e.g. Blue"
                  className="input-dark mt-2"
                />
              </div>
            </div>
            <button
              className="btn-primary w-full"
              onClick={handleUploadLayer}
              disabled={!selectedPackId || uploadingLayer}
              type="button"
            >
              {uploadingLayer ? "Uploading..." : "Upload Trait Layer"}
            </button>
          </div>
        </div>

        {assetsError && (
          <div className="card border-red-500/40 p-3 text-sm text-red-200">
            {assetsError}
          </div>
        )}

        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold text-white">Pack Assets</h4>
            <span className="text-xs text-zinc-500">
              {packAssets.length} items
            </span>
          </div>
          {assetsLoading && (
            <p className="text-sm text-zinc-400">Loading assets...</p>
          )}
          {!assetsLoading && packAssets.length === 0 && (
            <p className="text-sm text-zinc-400">No assets uploaded yet.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.isArray(packAssets)
              ? packAssets.map((asset, idx) => {
                  const assetKey =
                    asset.objectKey ?? asset.id ?? `${asset.kind ?? "asset"}-${idx}`;
                  const resolvedUrl = resolveAssetUrl(
                    asset.publicUrl || buildPublicUrl(asset.objectKey),
                  );
                  const displayUrl = assetPreviewUrls[assetKey] || resolvedUrl;
                  const isBroken = brokenAssets[assetKey];
                  const isBase = asset.kind === "base";
                  const traitLabel =
                    asset.traitName && asset.traitValue
                      ? `${asset.traitName}: ${asset.traitValue}`
                      : asset.traitName ?? asset.traitValue ?? "";
                  return (
                    <div
                      key={assetKey}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                    >
                      <div className="aspect-[4/5] w-full overflow-hidden rounded-lg bg-zinc-800">
                        {displayUrl && !isBroken ? (
                          <img
                            src={displayUrl}
                            alt={asset.objectKey ?? "asset"}
                            className="h-full w-full object-contain"
                            loading="lazy"
                            onError={() =>
                              void handleImageError(assetKey, resolvedUrl)
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                            Preview unavailable
                          </div>
                        )}
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-zinc-400">
                        <p className="text-zinc-500">
                          {isBase ? "Base image" : "Layer"}
                        </p>
                        {!isBase && (
                          <p className="text-zinc-200">
                            {traitLabel || "Trait: —"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <h4 className="text-base font-semibold text-white">
            Metadata Preview
          </h4>
          <div className="flex flex-wrap gap-2">
            <input
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder="Token ID"
              className="input-dark flex-1"
            />
            <button
              className="btn-secondary"
              onClick={handlePreviewMetadata}
              disabled={metadataLoading}
              type="button"
            >
              {metadataLoading ? "Loading..." : "Preview Metadata"}
            </button>
          </div>
          {metadataError && (
            <p className="text-sm text-red-200">{metadataError}</p>
          )}
          {metadata && (
            <div className="space-y-3">
              {metadata.image && (
                <img
                  src={metadata.image}
                  alt="Metadata preview"
                  className="w-full rounded-xl border border-zinc-800 object-cover"
                />
              )}
              {metadata.attributes && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-sm font-semibold text-white">Attributes</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {metadata.attributes.map((attr, idx) => (
                      <div
                        key={`${attr.trait_type}-${idx}`}
                        className="rounded-lg border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-300"
                      >
                        <p className="text-zinc-500">{attr.trait_type}</p>
                        <p className="text-zinc-100">{attr.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
                  Raw JSON
                </summary>
                <pre className="mt-2 overflow-x-auto text-xs">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardShell brands={brands} brandId={brandId} brandName={brand?.name}>
      {content}
    </DashboardShell>
  );
}
