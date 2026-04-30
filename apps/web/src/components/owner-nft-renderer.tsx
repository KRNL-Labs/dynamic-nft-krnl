"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { client } from "@/lib/client";
import { normalizeTraitKey } from "@/lib/trait-layers";

type LayerAsset = {
  traitName: string;
  traitValue: string;
  url: string;
};

function pickUrl(item: Record<string, unknown>): string {
  const candidate =
    (item.publicUrl as string | undefined) ??
    (item.publicURL as string | undefined) ??
    (item.url as string | undefined) ??
    (item.imageUrl as string | undefined);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function toLayerAssets(value: unknown): LayerAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const traitName =
        (item.traitName as string | undefined) ??
        (item.traitKey as string | undefined) ??
        (item.name as string | undefined) ??
        "";
      const traitValue =
        (item.traitValue as string | undefined) ??
        (item.value as string | undefined) ??
        "";
      const url = pickUrl(item);
      if (!traitName || !traitValue || !url) return null;
      return { traitName, traitValue, url };
    })
    .filter((item): item is LayerAsset => Boolean(item));
}

function getBaseImageUrl(pack: Record<string, unknown>): string {
  const direct =
    (pack.baseImageUrl as string | undefined) ??
    (pack.baseImageURL as string | undefined) ??
    (pack.baseUrl as string | undefined) ??
    (pack.previewImageUrl as string | undefined);
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const fallbackAssets = [
    ...(Array.isArray(pack.assets) ? (pack.assets as unknown[]) : []),
    ...(Array.isArray(pack.items) ? (pack.items as unknown[]) : []),
    ...(Array.isArray(pack.layers) ? (pack.layers as unknown[]) : []),
  ];
  for (const raw of fallbackAssets) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const kind =
      (item.kind as string | undefined) ??
      (item.type as string | undefined) ??
      "";
    if (kind.toLowerCase() !== "base") continue;
    const url = pickUrl(item);
    if (url) return url;
  }
  return "";
}

function getImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function isActiveTrait(item: Record<string, unknown>): boolean {
  return Boolean(
    (item.isActive as boolean | undefined) ??
      (item.active as boolean | undefined) ??
      (item.enabled as boolean | undefined) ??
      false,
  );
}

function readTraitName(item: Record<string, unknown>): string {
  const raw =
    (item.traitName as string | undefined) ??
    (item.traitKey as string | undefined) ??
    (item.name as string | undefined) ??
    "";
  return raw.trim();
}

function readTraitValue(item: Record<string, unknown>): string {
  const raw =
    (item.traitValue as string | undefined) ??
    (item.value as string | undefined) ??
    "";
  return raw.trim();
}

export default function OwnerNftRenderer({ brandId }: { brandId: string }) {
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const { data: activePack, error: activePackError } = useSWR(
    brandId ? `/api/me/brands/${brandId}/asset-pack/active` : null,
    () => client.getOwnerActiveAssetPack(brandId),
    { revalidateOnFocus: true, refreshInterval: 0 },
  );

  const { data: traitsSnapshot, error: traitsError } = useSWR(
    brandId ? `/api/me/traits?brandId=${brandId}` : null,
    () => client.getOwnerTraitsSnapshot(brandId),
    { revalidateOnFocus: true, refreshInterval: 0 },
  );

  const composition = useMemo(() => {
    if (!activePack || typeof activePack !== "object") return null;
    const pack = activePack as Record<string, unknown>;
    const baseUrl = getBaseImageUrl(pack);
    const layerAssets = [
      ...toLayerAssets(pack.layers),
      ...toLayerAssets(pack.assets),
      ...toLayerAssets(pack.items),
    ];

    const traits = Array.isArray(traitsSnapshot?.traits) ? traitsSnapshot.traits : [];
    const activeTraits = traits
      .filter((raw) => raw && typeof raw === "object")
      .map((raw) => raw as Record<string, unknown>)
      .filter(isActiveTrait);

    const selectedByName = new Map<string, string>();
    activeTraits.forEach((trait) => {
      const name = readTraitName(trait);
      const value = readTraitValue(trait);
      if (!name || !value) return;
      selectedByName.set(normalizeTraitKey(name), value);
    });

    const layerByTrait = new Map<string, string>();
    layerAssets.forEach((layer) => {
      const key = `${normalizeTraitKey(layer.traitName)}::${layer.traitValue
        .trim()
        .toLowerCase()}`;
      if (!layerByTrait.has(key)) {
        layerByTrait.set(key, layer.url);
      }
    });

    const getLayerUrlForTrait = (normalizedName: string): string | null => {
      const selectedValue = selectedByName.get(normalizedName);
      if (!selectedValue) return null;
      const key = `${normalizedName}::${selectedValue.trim().toLowerCase()}`;
      return layerByTrait.get(key) ?? null;
    };

    const backgroundName = normalizeTraitKey("Background");
    const postBaseOrder = [
      normalizeTraitKey("Armour"),
      normalizeTraitKey("Eyes"),
      normalizeTraitKey("Aura"),
      normalizeTraitKey("Companion"),
    ];

    const usedTraitNames = new Set<string>([backgroundName, ...postBaseOrder]);

    const backgroundUrl = getLayerUrlForTrait(backgroundName);
    const postBaseLayerUrls = postBaseOrder
      .map((traitName) => getLayerUrlForTrait(traitName))
      .filter((url): url is string => Boolean(url));

    const remainingLayerUrls: string[] = [];
    selectedByName.forEach((selectedValue, normalizedName) => {
      if (usedTraitNames.has(normalizedName)) return;
      const key = `${normalizedName}::${selectedValue.trim().toLowerCase()}`;
      const url = layerByTrait.get(key);
      if (url) remainingLayerUrls.push(url);
    });

    const urls = [
      backgroundUrl,
      baseUrl,
      ...postBaseLayerUrls,
      ...remainingLayerUrls,
    ].filter(Boolean);
    return urls.length > 0 ? urls : null;
  }, [activePack, traitsSnapshot?.traits]);

  useEffect(() => {
    if (!composition || composition.length === 0) {
      setRenderedUrl(null);
      setRenderError(null);
      return;
    }

    let mounted = true;
    setRendering(true);
    setRenderError(null);

    const render = async () => {
      try {
        const images = await Promise.all(composition.map((url) => getImage(url)));
        if (!mounted || images.length === 0) return;
        const width = images[0].naturalWidth || 1024;
        const height = images[0].naturalHeight || 1024;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to create canvas context.");
        }
        images.forEach((img) => {
          ctx.drawImage(img, 0, 0, width, height);
        });
        const dataUrl = canvas.toDataURL("image/png");
        if (!mounted) return;
        setRenderedUrl(dataUrl);
      } catch (err) {
        if (!mounted) return;
        setRenderedUrl(null);
        setRenderError(err instanceof Error ? err.message : "Failed to render NFT.");
      } finally {
        if (mounted) setRendering(false);
      }
    };

    void render();

    return () => {
      mounted = false;
    };
  }, [composition]);

  const loadError = activePackError ?? traitsError;
  const errorMessage =
    renderError ??
    (loadError instanceof Error ? loadError.message : null);

  return (
    <div className="card space-y-3 p-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Preview</p>
        <h3 className="text-lg font-semibold text-white">My NFT</h3>
      </div>

      {rendering && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          Rendering preview...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {!rendering && !errorMessage && renderedUrl && (
        <div className="mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={renderedUrl}
            alt="Rendered NFT"
            className="h-full w-full object-contain"
          />
        </div>
      )}

      {!rendering && !errorMessage && !renderedUrl && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          No active asset pack or active traits available for rendering.
        </div>
      )}
    </div>
  );
}
