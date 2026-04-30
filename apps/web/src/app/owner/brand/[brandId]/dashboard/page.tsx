"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import OwnerShell from "@/components/owner-shell";
import PortalGate from "@/components/portal-gate";
import OwnerNftRenderer from "@/components/owner-nft-renderer";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { clearOwnerSelectedBrandId, setOwnerSelectedBrandId } from "@/lib/owner-brand";

function readXpBalance(data: Record<string, unknown> | undefined): number | string {
  const candidates = [
    data?.xpBalance,
    data?.xpAvailable,
    data?.availableXp,
    data?.xp,
    data?.xpTotal,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return "—";
}

function readLootKeysBalance(data: Record<string, unknown> | undefined): number | string {
  const candidates = [data?.lootKeysBalance, data?.lootKeys, data?.keys];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return "—";
}

export default function OwnerBrandDashboardPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const router = useRouter();
  const auth = useAuthContext();
  const portal = usePortalContext();

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

  const { data: ownerBrandsData, error: brandsError } = useSWR(
    ownerEnabled ? "/api/me/brands" : null,
    () => client.getOwnerBrands(),
    { refreshInterval: 0, revalidateOnFocus: false },
  );

  const { data: balancesData, error: balancesError } = useSWR(
    ownerEnabled ? `/api/me/balances?brandId=${brandId}` : null,
    () => client.getOwnerBalances(brandId),
    { refreshInterval: 0, revalidateOnFocus: true },
  );

  const { data: traitsSnapshot, error: traitsError } = useSWR(
    ownerEnabled ? `/api/me/traits?brandId=${brandId}` : null,
    () => client.getOwnerTraitsSnapshot(brandId),
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

  const traitList = Array.isArray(traitsSnapshot?.traits) ? traitsSnapshot.traits : [];
  const unlockedTraitsCount = traitList.length;
  const activeTraitsCount = traitList.filter((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const trait = raw as Record<string, unknown>;
    return Boolean(
      (trait.isActive as boolean | undefined) ??
        (trait.active as boolean | undefined) ??
        false,
    );
  }).length;

  const xpBalance = readXpBalance(
    balancesData as unknown as Record<string, unknown> | undefined,
  );
  const lootKeysBalance = readLootKeysBalance(
    balancesData as unknown as Record<string, unknown> | undefined,
  );

  const content = (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Overview</p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              {currentBrand?.name ?? "Brand"}
            </h1>
            <p className="text-sm text-zinc-400">
              View your NFT, balances, and current trait activation state.
            </p>
          </div>
          {currentBrand?.logoUrl && (
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentBrand.logoUrl}
                alt={currentBrand.name ?? "Brand logo"}
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {(brandsError || balancesError || traitsError) && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {(brandsError as Error | undefined)?.message ||
            (balancesError as Error | undefined)?.message ||
            (traitsError as Error | undefined)?.message ||
            "Failed to load owner dashboard."}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">XP Balance</p>
          <p className="mt-2 text-2xl font-semibold text-white">{xpBalance}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Lootkeys</p>
          <p className="mt-2 text-2xl font-semibold text-white">{lootKeysBalance}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Unlocked Traits</p>
          <p className="mt-2 text-2xl font-semibold text-white">{unlockedTraitsCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Active Traits</p>
          <p className="mt-2 text-2xl font-semibold text-white">{activeTraitsCount}</p>
        </div>
      </div>

      <OwnerNftRenderer brandId={brandId} />

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <Link href={`/owner/brand/${brandId}/lootbox`} className="btn-secondary">
          Manage Lootbox
        </Link>
        <Link href={`/owner/brand/${brandId}/traits`} className="btn-secondary">
          Manage Traits
        </Link>
      </div>
    </div>
  );

  return (
    <PortalGate portal="owner">
      <OwnerShell headerTitle={currentBrand?.name ?? "Owner Dashboard"} lootKeysBalance={lootKeysBalance}>
        {content}
      </OwnerShell>
    </PortalGate>
  );
}
