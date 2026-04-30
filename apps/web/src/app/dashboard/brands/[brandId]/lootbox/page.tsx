"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { isApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import {
  AssetPack,
  AssetPackAsset,
  Brand,
  LootboxConfig,
  NftConfig,
} from "@/types";

type DraftLootRow = {
  traitName: string;
  traitValue: string;
  weight: string;
};

type TraitValueMap = Record<string, string[]>;

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeLootRows(config: LootboxConfig): DraftLootRow[] {
  const source =
    (Array.isArray(config.lootTable) ? config.lootTable : null) ??
    (Array.isArray(config.items) ? config.items : null) ??
    [];

  return source.map((row) => ({
    traitName: String(row.traitName ?? ""),
    traitValue: String(row.traitValue ?? ""),
    weight:
      row.weight === null || row.weight === undefined
        ? "1"
        : String(row.weight),
  }));
}

function buildTraitValueMap(assets: AssetPackAsset[]): TraitValueMap {
  const map = new Map<string, Set<string>>();
  assets.forEach((asset) => {
    const kind = String(asset.kind ?? "").toLowerCase();
    const traitName = String(asset.traitName ?? "").trim();
    const traitValue = String(asset.traitValue ?? "").trim();
    if (!traitName || !traitValue) return;
    if (kind === "base") return;
    if (kind && !["layer", "state", "trait"].includes(kind)) return;
    const values = map.get(traitName) ?? new Set<string>();
    values.add(traitValue);
    map.set(traitName, values);
  });

  const entries = Array.from(map.entries())
    .map(([traitName, values]) => [
      traitName,
      Array.from(values).sort((a, b) => a.localeCompare(b)),
    ] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return Object.fromEntries(entries);
}

function formatValidationError(err: unknown): string {
  if (!isApiError(err)) {
    return err instanceof Error ? err.message : "Failed to save lootbox config";
  }

  const body = err.body;
  if (body && typeof body === "object") {
    const obj = body as {
      message?: string;
      error?: string;
      details?: { message?: string };
      errors?: Array<{ message?: string; msg?: string }>;
    };

    const messages = [
      obj.message,
      obj.error,
      obj.details?.message,
      ...(Array.isArray(obj.errors)
        ? obj.errors
            .map((item) => item.message ?? item.msg)
            .filter((item): item is string => Boolean(item))
        : []),
    ].filter((item): item is string => Boolean(item));

    if (messages.length > 0) {
      return messages.join("\n");
    }
  }

  return err.message;
}

export default function BrandLootboxPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [assetPacks, setAssetPacks] = useState<AssetPack[]>([]);
  const [nftConfig, setNftConfig] = useState<NftConfig | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [xpPerLootKey, setXpPerLootKey] = useState<string>("100");
  const [lootKeysPerOpen, setLootKeysPerOpen] = useState<string>("1");
  const [maxUnlocksPerOpen, setMaxUnlocksPerOpen] = useState<string>("1");
  const [lootRows, setLootRows] = useState<DraftLootRow[]>([]);
  const [traitValueMap, setTraitValueMap] = useState<TraitValueMap>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAssetPackId = nftConfig?.activeAssetPackId ?? null;
  const activeAssetPackName = useMemo(() => {
    if (!activeAssetPackId) return null;
    const match = assetPacks.find((pack) => pack.id === activeAssetPackId);
    return match?.name ?? "Pack not found";
  }, [activeAssetPackId, assetPacks]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandList, brandDetail, config, contractConfig, packs] =
        await Promise.all([
          client.listMyBrands(),
          client.getBrand(brandId),
          client.getLootboxConfig(brandId).catch(() => ({} as LootboxConfig)),
          client.getNftConfig(brandId).catch(() => ({} as NftConfig)),
          client.listAssetPacks(brandId).catch(() => [] as AssetPack[]),
        ]);
      setBrands(brandList);
      setBrand(brandDetail);
      setNftConfig(contractConfig ?? null);
      setAssetPacks(Array.isArray(packs) ? packs : []);

      const resolvedEnabled =
        typeof config.enabled === "boolean" ? config.enabled : true;
      const resolvedXpPerLootKey = toNumber(
        config.xpPerLootKey ?? config.xpCostToOpen,
        100,
      );
      const resolvedLootKeysPerOpen = toNumber(config.lootKeysPerOpen, 1);
      const resolvedMaxUnlocks = toNumber(config.maxUnlocksPerOpen, 1);

      setEnabled(resolvedEnabled);
      setXpPerLootKey(String(resolvedXpPerLootKey));
      setLootKeysPerOpen(String(resolvedLootKeysPerOpen));
      setMaxUnlocksPerOpen(String(resolvedMaxUnlocks));
      setLootRows(normalizeLootRows(config));

      const activePackId = contractConfig?.activeAssetPackId;
      if (activePackId) {
        const packAssets = await client
          .listPackAssets(brandId, activePackId)
          .catch(() => [] as AssetPackAsset[]);
        setTraitValueMap(
          buildTraitValueMap(Array.isArray(packAssets) ? packAssets : []),
        );
      } else {
        setTraitValueMap({});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load lootbox config";
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [brandId, toast]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;
    void load();
  }, [
    auth.isAuthenticated,
    auth.walletAddress,
    portal.portalReady,
    portal.portalType,
    load,
  ]);

  const addRow = () => {
    const firstTraitName = Object.keys(traitValueMap)[0] ?? "";
    const firstTraitValue =
      firstTraitName && traitValueMap[firstTraitName]?.length
        ? traitValueMap[firstTraitName][0]
        : "";
    setLootRows((prev) => [
      ...prev,
      {
        traitName: firstTraitName,
        traitValue: firstTraitValue,
        weight: "1",
      },
    ]);
  };

  const removeRow = (index: number) => {
    setLootRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateRow = (index: number, key: keyof DraftLootRow, value: string) => {
    setLootRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        if (key !== "traitName") {
          return { ...row, [key]: value };
        }
        const nextTraitName = value;
        const options = traitValueMap[nextTraitName] ?? [];
        const nextTraitValue = options.includes(row.traitValue)
          ? row.traitValue
          : options[0] ?? "";
        return {
          ...row,
          traitName: nextTraitName,
          traitValue: nextTraitValue,
        };
      }),
    );
  };

  const traitNameOptions = useMemo(
    () => Object.keys(traitValueMap).sort((a, b) => a.localeCompare(b)),
    [traitValueMap],
  );

  const localValidationError = useMemo(() => {
    const xpPerKey = Number(xpPerLootKey);
    if (!Number.isFinite(xpPerKey) || xpPerKey < 0) {
      return "XP per lootkey must be 0 or greater.";
    }

    const keysPerOpen = Number(lootKeysPerOpen);
    if (!Number.isFinite(keysPerOpen) || keysPerOpen < 1) {
      return "Lootkeys required per lootbox must be at least 1.";
    }

    const maxUnlocks = Number(maxUnlocksPerOpen);
    if (!Number.isFinite(maxUnlocks) || maxUnlocks < 1) {
      return "Max unlocks per open must be at least 1.";
    }

    for (let i = 0; i < lootRows.length; i += 1) {
      const row = lootRows[i];
      const traitName = row.traitName.trim();
      const traitValue = row.traitValue.trim();
      const weight = Number(row.weight);

      const hasAny = traitName.length > 0 || traitValue.length > 0 || row.weight.trim().length > 0;
      const hasBothTraits = traitName.length > 0 && traitValue.length > 0;
      if (hasAny && !hasBothTraits) {
        return `Loot table row ${i + 1} must include both Trait Name and Trait Value.`;
      }
      if (hasBothTraits && (!Number.isFinite(weight) || weight <= 0)) {
        return `Loot table row ${i + 1} weight must be greater than 0.`;
      }
    }

    return null;
  }, [lootRows, lootKeysPerOpen, maxUnlocksPerOpen, xpPerLootKey]);

  const handleSave = async () => {
    setError(null);

    if (localValidationError) {
      setError(localValidationError);
      return;
    }

    const xpPerKey = Number(xpPerLootKey);
    const keysPerOpen = Number(lootKeysPerOpen);
    const maxUnlocks = Number(maxUnlocksPerOpen);

    const rowsMapped = lootRows
      .map((row) => {
        const traitKey = row.traitName.trim();
        const traitValue = row.traitValue.trim();
        const weight = Number(row.weight);
        if (!traitKey || !traitValue) return null;
        if (!Number.isFinite(weight) || weight <= 0) return null;
        return {
          traitKey,
          traitValue,
          weight,
        };
      })
      .filter(
        (row): row is { traitKey: string; traitValue: string; weight: number } =>
          Boolean(row),
      );

    const payload = {
      enabled,
      xpPerLootKey: xpPerKey,
      lootKeysPerOpen: keysPerOpen,
      maxUnlocksPerOpen: maxUnlocks,
      lootTable: {
        entries: rowsMapped,
      },
    };

    setSaving(true);
    try {
      await client.setLootboxConfig(brandId, payload as unknown as LootboxConfig);
      toast.addToast("Lootbox config saved", "success");
      await load();
    } catch (err) {
      const message = formatValidationError(err);
      setError(message);
      toast.addToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Lootbox Config</h1>
          <p className="mt-2 text-sm text-zinc-400">Login to configure lootbox rules.</p>
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
        <p className="text-xs uppercase tracking-wide text-zinc-500">Lootbox</p>
        <h1 className="text-2xl font-bold text-white">Lootbox Config</h1>
        <p className="text-sm text-zinc-400">
          Owners buy lootkeys using Zealy XP. Lootboxes consume lootkeys.
        </p>
      </div>

      {!activeAssetPackId && (
        <div className="card border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          Set active asset pack before configuring lootbox.
        </div>
      )}

      {activeAssetPackId && (
        <div className="card p-4 text-xs text-zinc-400">
          Active asset pack:{" "}
          <span className="text-zinc-200">{activeAssetPackName}</span>
        </div>
      )}

      {loading && <div className="card p-4 text-sm text-zinc-400">Loading...</div>}

      {error && (
        <div className="card border-red-500/40 p-4 text-sm whitespace-pre-line text-red-200">
          {error}
        </div>
      )}

      <div className="card space-y-4 p-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-300">Enabled</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-red-500"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              className="text-xs uppercase tracking-wide text-zinc-500"
              htmlFor="xpPerLootKey"
            >
              XP per Lootkey
            </label>
            <input
              id="xpPerLootKey"
              type="number"
              min={0}
              className="input-dark mt-2"
              value={xpPerLootKey}
              onChange={(e) => setXpPerLootKey(e.target.value)}
            />
          </div>

          <div>
            <label
              className="text-xs uppercase tracking-wide text-zinc-500"
              htmlFor="lootKeysPerOpen"
            >
              Lootkeys required per Lootbox
            </label>
            <input
              id="lootKeysPerOpen"
              type="number"
              min={1}
              className="input-dark mt-2"
              value={lootKeysPerOpen}
              onChange={(e) => setLootKeysPerOpen(e.target.value)}
            />
          </div>

          <div>
            <label
              className="text-xs uppercase tracking-wide text-zinc-500"
              htmlFor="maxUnlocksPerOpen"
            >
              Max unlocks per open
            </label>
            <input
              id="maxUnlocksPerOpen"
              type="number"
              min={1}
              className="input-dark mt-2"
              value={maxUnlocksPerOpen}
              onChange={(e) => setMaxUnlocksPerOpen(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Loot table</h2>
          <button type="button" className="btn-secondary" onClick={addRow}>
            Add Row
          </button>
        </div>

        {lootRows.length === 0 ? (
          <p className="text-sm text-zinc-500">No rows yet. Add at least one trait entry.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-1 text-[11px] uppercase tracking-wide text-zinc-500">
              <span className="col-span-3">Trait Name</span>
              <span className="col-span-4">Trait Value</span>
              <span className="col-span-3">Weight</span>
              <span className="col-span-2">Remove</span>
            </div>

            {lootRows.map((row, index) => (
              <div
                key={`loot-row-${index}`}
                className="grid grid-cols-12 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2"
              >
                <select
                  className="input-dark col-span-3"
                  value={row.traitName}
                  onChange={(e) => updateRow(index, "traitName", e.target.value)}
                >
                  <option value="">Select trait</option>
                  {row.traitName &&
                    !traitNameOptions.includes(row.traitName) && (
                      <option value={row.traitName}>{row.traitName}</option>
                    )}
                  {traitNameOptions.map((traitName) => (
                    <option key={traitName} value={traitName}>
                      {traitName}
                    </option>
                  ))}
                </select>
                <select
                  className="input-dark col-span-4"
                  value={row.traitValue}
                  onChange={(e) => updateRow(index, "traitValue", e.target.value)}
                  disabled={!row.traitName}
                >
                  <option value="">
                    {row.traitName ? "Select value" : "Select trait first"}
                  </option>
                  {row.traitValue &&
                    !(traitValueMap[row.traitName] ?? []).includes(row.traitValue) && (
                      <option value={row.traitValue}>{row.traitValue}</option>
                    )}
                  {(traitValueMap[row.traitName] ?? []).map((value) => (
                    <option key={`${row.traitName}-${value}`} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <input
                  className="input-dark col-span-3"
                  value={row.weight}
                  type="number"
                  min={1}
                  onChange={(e) => updateRow(index, "weight", e.target.value)}
                  placeholder="1"
                />
                <button
                  type="button"
                  className="btn-secondary col-span-2"
                  onClick={() => removeRow(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSave()}
          disabled={saving || Boolean(localValidationError)}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <DashboardShell brands={brands} brandId={brandId} brandName={brand?.name}>
      {content}
    </DashboardShell>
  );
}
