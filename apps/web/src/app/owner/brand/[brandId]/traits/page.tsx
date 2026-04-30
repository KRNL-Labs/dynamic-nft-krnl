"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import PortalGate from "@/components/portal-gate";
import OwnerShell from "@/components/owner-shell";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { clearOwnerSelectedBrandId, setOwnerSelectedBrandId } from "@/lib/owner-brand";
import { useToast } from "@/components/toast";

type TraitOption = {
  id: string;
  traitName: string;
  traitValue: string;
  isActive: boolean;
  imageUrl: string | null;
};

function parseTraitOption(raw: unknown, index: number): TraitOption | null {
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

  if (!traitName.trim() || !traitValue.trim()) return null;
  const id =
    (item.id as string | undefined) ??
    (item.traitId as string | undefined) ??
    `${traitName}:${traitValue}:${index}`;
  const isActive = Boolean(
    (item.isActive as boolean | undefined) ??
      (item.active as boolean | undefined) ??
      false,
  );
  const imageUrl =
    (item.imageUrl as string | undefined) ??
    (item.image_url as string | undefined) ??
    (item.publicUrl as string | undefined) ??
    (item.public_url as string | undefined) ??
    (item.url as string | undefined) ??
    null;
  return {
    id,
    traitName: traitName.trim(),
    traitValue: traitValue.trim(),
    isActive,
    imageUrl:
      typeof imageUrl === "string" && imageUrl.trim().length > 0
        ? imageUrl.trim()
        : null,
  };
}

function pickLootkeys(data: Record<string, unknown> | undefined): number | string {
  const candidates = [data?.lootKeysBalance, data?.lootKeys, data?.keys];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return "—";
}

export default function OwnerBrandTraitsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const router = useRouter();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [selectionByTrait, setSelectionByTrait] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandId) return;
    setOwnerSelectedBrandId(brandId);
  }, [brandId]);

  const ownerEnabled =
    auth.isAuthenticated &&
    Boolean(auth.walletAddress) &&
    portal.portalReady &&
    portal.portalType === "owner" &&
    Boolean(brandId);

  const { data: ownerBrandsData } = useSWR(
    ownerEnabled ? "/api/me/brands" : null,
    () => client.getOwnerBrands(),
    { refreshInterval: 0, revalidateOnFocus: false },
  );

  const { data: traitsSnapshot, error: traitsError, mutate: refreshTraits } = useSWR(
    ownerEnabled ? `/api/me/traits?brandId=${brandId}` : null,
    () => client.getOwnerTraitsSnapshot(brandId),
    { refreshInterval: 0, revalidateOnFocus: true },
  );

  const { data: balancesData } = useSWR(
    ownerEnabled ? `/api/me/balances?brandId=${brandId}` : null,
    () => client.getOwnerBalances(brandId),
    { refreshInterval: 0, revalidateOnFocus: true },
  );

  const currentBrand = useMemo(() => {
    if (!Array.isArray(ownerBrandsData)) return null;
    return (
      ownerBrandsData.find((brand) => (brand.id ?? brand.brandId ?? "") === brandId) ??
      null
    );
  }, [ownerBrandsData, brandId]);

  useEffect(() => {
    if (!Array.isArray(ownerBrandsData)) return;
    const exists = ownerBrandsData.some(
      (brand) => (brand.id ?? brand.brandId ?? "") === brandId,
    );
    if (exists) return;
    clearOwnerSelectedBrandId();
    router.replace("/owner/brands");
  }, [brandId, ownerBrandsData, router]);

  const traitOptions = useMemo(() => {
    const list = Array.isArray(traitsSnapshot?.traits) ? traitsSnapshot.traits : [];
    return list
      .map((raw, index) => parseTraitOption(raw, index))
      .filter((item): item is TraitOption => Boolean(item));
  }, [traitsSnapshot?.traits]);

  const groupedTraits = useMemo(() => {
    const map = new Map<string, TraitOption[]>();
    traitOptions.forEach((option) => {
      const existing = map.get(option.traitName) ?? [];
      existing.push(option);
      map.set(option.traitName, existing);
    });
    return Array.from(map.entries())
      .map(([traitName, options]) => ({ traitName, options }))
      .sort((a, b) => a.traitName.localeCompare(b.traitName));
  }, [traitOptions]);

  useEffect(() => {
    const next: Record<string, string> = {};
    groupedTraits.forEach((group) => {
      const active = group.options.find((option) => option.isActive);
      if (active) {
        next[group.traitName] = active.traitValue;
      }
    });
    setSelectionByTrait(next);
  }, [groupedTraits]);

  const selectedCount = Object.values(selectionByTrait).filter(Boolean).length;
  const lootKeysBalance = pickLootkeys(
    balancesData as unknown as Record<string, unknown> | undefined,
  );

  const handleSelect = (traitName: string, traitValue: string) => {
    setSelectionByTrait((prev) => {
      const current = prev[traitName];
      if (current === traitValue) {
        const clone = { ...prev };
        delete clone[traitName];
        return clone;
      }
      return { ...prev, [traitName]: traitValue };
    });
  };

  const handleSave = async () => {
    if (!brandId) return;
    setError(null);
    const selections = Object.entries(selectionByTrait)
      .filter(([, traitValue]) => traitValue && traitValue.trim().length > 0)
      .map(([traitKey, traitValue]) => ({
        traitKey,
        traitValue: traitValue.trim(),
      }));

    if (selections.length === 0) {
      setError("Select at least one trait value.");
      return;
    }
    if (selections.length > 5) {
      setError("You can activate up to 5 trait layers.");
      return;
    }

    setSaving(true);
    try {
      await client.activateUserTraits(selections, brandId);
      await refreshTraits();
      toast.addToast("Active traits updated.", "success");
      router.push(`/owner/brand/${encodeURIComponent(brandId)}/dashboard`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to activate traits.";
      setError(message);
      toast.addToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="space-y-5">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Traits</p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {currentBrand?.name ?? "Brand"}
        </h1>
        <p className="text-sm text-zinc-400">
          Choose one trait value per trait type. Maximum 5 active layers.
        </p>
      </div>

      <div className="card p-4 text-sm text-zinc-300">
        Active selections:{" "}
        <span className="font-semibold text-white">{selectedCount}</span> / 5
        <span className="ml-4">
          Lootkeys: <span className="font-semibold text-white">{lootKeysBalance}</span>
        </span>
      </div>

      {traitsError && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {traitsError instanceof Error ? traitsError.message : "Failed to load traits."}
        </div>
      )}

      {groupedTraits.length === 0 ? (
        <div className="card p-4 text-sm text-zinc-400">
          No unlocked traits yet.
        </div>
      ) : (
        groupedTraits.map((group) => (
          <div key={group.traitName} className="card space-y-3 p-4">
            <h3 className="text-base font-semibold text-white">{group.traitName}</h3>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {group.options.map((option) => {
                const active = selectionByTrait[group.traitName] === option.traitValue;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(group.traitName, option.traitValue)}
                    className={`rounded-xl border p-3 text-left text-sm transition ${
                      active
                        ? "border-red-500/50 bg-red-500/10 text-white"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <div className="space-y-2">
                      {option.imageUrl && (
                        <div className="aspect-square w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={option.imageUrl}
                            alt={`${group.traitName} ${option.traitValue}`}
                            className="h-full w-full object-contain"
                          />
                        </div>
                      )}
                      <p>{option.traitValue}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSave()}
          disabled={saving || selectedCount === 0 || selectedCount > 5}
        >
          {saving ? "Saving..." : "Set Active Traits"}
        </button>
      </div>
    </div>
  );

  return (
    <PortalGate portal="owner">
      <OwnerShell headerTitle={currentBrand?.name ?? "Traits"} lootKeysBalance={lootKeysBalance}>
        {content}
      </OwnerShell>
    </PortalGate>
  );
}
