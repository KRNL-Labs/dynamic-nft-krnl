"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import NftConfigForm from "@/components/nft-config-form";
import { useAuthContext } from "@/lib/auth";
import { apiFetch, isApiError } from "@/lib/api";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { usePortalContext } from "@/lib/portal";
import { Brand, NftConfig } from "@/types";

export default function BrandNftPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();
  const selectingRef = useRef(false);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [config, setConfig] = useState<NftConfig | null>(null);
  const [globalMetadataBaseUri, setGlobalMetadataBaseUri] = useState("");
  const [globalContractAddress, setGlobalContractAddress] = useState("");
  const [globalChainId, setGlobalChainId] = useState("");
  const [erc7496Supported, setErc7496Supported] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [tokenId, setTokenId] = useState("");
  const [previewToken, setPreviewToken] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;
    if (!brandId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [brandList, brandDetail, nft, configData] = await Promise.all([
          client.listMyBrands(),
          client.getBrand(brandId),
          client.getNftConfig(brandId),
          apiFetch<{
            metadataBaseUrl?: string;
            contractAddress?: string;
            chainId?: number | string;
            erc7496Supported?: boolean;
          }>("/api/system/config"),
        ]);
        setBrands(brandList);
        setBrand(brandDetail);
        setConfig(nft);
        setGlobalMetadataBaseUri(configData?.metadataBaseUrl ?? "");
        setGlobalContractAddress(configData?.contractAddress ?? "");
        setGlobalChainId(
          configData?.chainId !== undefined ? String(configData.chainId) : "",
        );
        setErc7496Supported(Boolean(configData?.erc7496Supported));
        setConfigError(null);
      } catch (err) {
        const msg =
          isApiError(err) && err.body
            ? (err.body as { message?: string; error?: string }).message ??
              (err.body as { message?: string; error?: string }).error ??
              err.message
            : err instanceof Error
              ? err.message
              : "Failed to load NFT config";
        setError(msg);
        setConfigError(msg);
        toast.addToast(msg, "error");
      } finally {
        setLoading(false);
      }
    };

    const run = async () => {
      if (portal.portalType !== "brand" || portal.brandId !== brandId) {
        if (selectingRef.current) return;
        selectingRef.current = true;
        try {
          await portal.ensurePortal("brand", brandId);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to select portal";
          setError(msg);
          setConfigError(msg);
          toast.addToast(msg, "error");
          return;
        } finally {
          selectingRef.current = false;
        }
      }
      await load();
    };

    void run();
  }, [
    auth.isAuthenticated,
    auth.walletAddress,
    portal.portalReady,
    brandId,
    portal,
    portal.brandId,
    portal.portalType,
    toast,
  ]);

  const refreshSystemConfig = async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const configData = await apiFetch<{
        metadataBaseUrl?: string;
        contractAddress?: string;
        chainId?: number | string;
        erc7496Supported?: boolean;
      }>("/api/system/config");
      setGlobalMetadataBaseUri(configData?.metadataBaseUrl ?? "");
      setGlobalContractAddress(configData?.contractAddress ?? "");
      setGlobalChainId(
        configData?.chainId !== undefined ? String(configData.chainId) : "",
      );
      setErc7496Supported(Boolean(configData?.erc7496Supported));
      setConfigError(null);
      toast.addToast("System config refreshed", "success");
    } catch (err) {
      const msg =
        isApiError(err) && err.body
          ? (err.body as { message?: string; error?: string }).message ??
            (err.body as { message?: string; error?: string }).error ??
            err.message
          : err instanceof Error
            ? err.message
            : "Failed to load system config";
      setConfigError(msg);
      toast.addToast(msg, "error");
    } finally {
      setConfigLoading(false);
    }
  };

  const buildConfigPayload = (payload: NftConfig): NftConfig => {
    const merged: NftConfig = {};
    const contractAddress = payload.contractAddress ?? config?.contractAddress;
    if (contractAddress) {
      merged.contractAddress = contractAddress;
    }
    const chainId = payload.chainId ?? config?.chainId;
    if (chainId !== undefined && chainId !== null && chainId !== "") {
      merged.chainId = Number(chainId);
    }
    const rpcUrl = payload.rpcUrl ?? config?.rpcUrl;
    if (rpcUrl) {
      merged.rpcUrl = rpcUrl;
    }
    if (config?.activeAssetPackId) {
      merged.activeAssetPackId = config.activeAssetPackId;
    }
    if (config?.metadataBaseURI) {
      merged.metadataBaseURI = config.metadataBaseURI;
    }
    return merged;
  };

  const handleSave = async (payload: NftConfig) => {
    const merged = buildConfigPayload(payload);
    await client.setNftConfig(brandId, merged);
    setConfig((prev) => ({ ...prev, ...merged }));
    toast.addToast("NFT config saved", "success");
  };


  const normalizedGlobalBase = useMemo(() => {
    if (!globalMetadataBaseUri) return "";
    return globalMetadataBaseUri.endsWith("/")
      ? globalMetadataBaseUri
      : `${globalMetadataBaseUri}/`;
  }, [globalMetadataBaseUri]);

  const resolvedPreviewBase = useMemo(() => {
    return normalizedGlobalBase.replace(/\/$/, "");
  }, [normalizedGlobalBase]);

  const previewUrl =
    previewToken && resolvedPreviewBase
      ? `${resolvedPreviewBase}/${previewToken}`
      : "";

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">NFT Config</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to manage NFT contract settings.
          </p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  const content = (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">NFT</p>
        <h1 className="text-2xl font-bold text-white">NFT Contract</h1>
        <p className="text-sm text-zinc-400">
          Configure contract address and RPC endpoint.
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
      {!config && !loading && (
        <div className="card border-red-500/30 p-4 text-sm text-red-200">
          NFT contract not configured; workflows will fail.
        </div>
      )}
      <NftConfigForm initial={config} onSave={handleSave} />
        <div className="card space-y-3 p-4 text-sm text-zinc-300">
          <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">System Config</h3>
            {erc7496Supported && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                ERC-7496 enabled
              </span>
            )}
          </div>
          <p className="text-zinc-400">
            Metadata is global and managed by the platform.
          </p>
        </div>
        {configError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            {configError}
          </div>
        )}
        <button
          className="btn-secondary w-fit"
          onClick={() => void refreshSystemConfig()}
          disabled={configLoading}
        >
          {configLoading ? "Refreshing..." : "Refresh"}
        </button>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
            <p className="text-zinc-500">Global Contract Address</p>
            <p className="mt-2 break-all text-zinc-100">
              {globalContractAddress || "Not configured"}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
            <p className="text-zinc-500">Global Chain ID</p>
            <p className="mt-2 break-all text-zinc-100">
              {globalChainId || "Not configured"}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
            <p className="text-zinc-500">Saved RPC URL</p>
            <p className="mt-2 break-all text-zinc-100">
              {config?.rpcUrl || "Not configured"}
            </p>
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Metadata Preview</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            placeholder="Token ID"
            className="input-dark flex-1"
          />
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              const trimmed = tokenId.trim();
              if (!trimmed) {
                setPreviewError("Enter a token id to preview.");
                return;
              }
              if (!resolvedPreviewBase) {
                setPreviewError("No base URI available for preview.");
                return;
              }
              setPreviewError(null);
              setPreviewToken(trimmed);
            }}
          >
            Preview
          </button>
        </div>
        {previewError && (
          <p className="text-sm text-red-200">{previewError}</p>
        )}
        {previewUrl && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Metadata URL
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="break-all text-zinc-100">{previewUrl}</span>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                Open
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardShell
      brands={brands}
      brandId={brandId}
      brandName={brand?.name}
    >
      {content}
    </DashboardShell>
  );
}
