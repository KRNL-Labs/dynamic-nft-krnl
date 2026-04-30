"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { getOwnerSelectedBrandId } from "@/lib/owner-brand";

export default function OwnerLootboxesPage() {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [brandChecked, setBrandChecked] = useState(false);
  const [unlockedTraits, setUnlockedTraits] = useState<Array<Record<string, unknown>>>(
    [],
  );

  const profileFetcher = () =>
    selectedBrandId ? client.getUserProfile(selectedBrandId) : client.getUserProfile();

  useEffect(() => {
    const stored = getOwnerSelectedBrandId();
    setSelectedBrandId(stored);
    setBrandChecked(true);
    if (!stored) {
      router.replace("/owner/brands");
    }
  }, [router]);

  const { data: profile } = useSWR(
    auth.isAuthenticated &&
      auth.walletAddress &&
      portal.portalReady &&
      portal.portalType === "owner" &&
      !!selectedBrandId
      ? `/api/me?brandId=${selectedBrandId}`
      : null,
    profileFetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: true,
    },
  );

  const lootKeys = profile?.lootKeys ?? 0;
  const canOpen = lootKeys > 0 && !opening;

  const handleOpenLootbox = async () => {
    if (!selectedBrandId) {
      toast.addToast("Select a brand first.", "error");
      return;
    }
    setOpening(true);
    try {
      const response = await client.openLootbox(selectedBrandId);
      const unlocked = Array.isArray(response.unlockedTraits)
        ? response.unlockedTraits
        : Array.isArray(response.traits)
          ? response.traits
          : [];
      setUnlockedTraits(unlocked);
      toast.addToast(
        unlocked.length
          ? `Lootbox opened. Unlocked ${unlocked.length} trait${unlocked.length > 1 ? "s" : ""}.`
          : "Lootbox opened.",
        "success",
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to open lootbox";
      toast.addToast(msg, "error");
    } finally {
      setOpening(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Lootboxes</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Login to open lootboxes.
        </p>
        <button onClick={auth.login} className="btn-primary mt-4">
          Login
        </button>
      </div>
    );
  }

  if (brandChecked && !selectedBrandId) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold text-white">
          Select a brand
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Choose a brand to continue in the owner portal.
        </p>
        <button
          onClick={() => router.replace("/owner/brands")}
          className="btn-primary mt-4"
        >
          Select brand
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Lootboxes
        </p>
        <h1 className="text-2xl font-bold text-white">Open Lootboxes</h1>
        <p className="text-sm text-zinc-400">
          Spend loot keys to unlock rewards.
        </p>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Loot Keys</h2>
            <p className="text-sm text-zinc-400">
              Available: {lootKeys}
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={!canOpen}
            onClick={() => void handleOpenLootbox()}
          >
            {opening ? "Opening..." : "Open Lootbox"}
          </button>
        </div>
        {!canOpen && (
          <p className="mt-2 text-xs text-zinc-500">
            You need at least one loot key to open a lootbox.
          </p>
        )}
      </div>

      {unlockedTraits.length > 0 && (
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Unlocked Traits
          </p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-200">
            {unlockedTraits.map((trait, index) => {
              const label =
                (trait.name as string | undefined) ??
                (trait.traitName as string | undefined) ??
                (trait.traitKey as string | undefined) ??
                `Trait ${index + 1}`;
              const value =
                (trait.value as string | number | undefined) ??
                (trait.traitValue as string | number | undefined);
              return (
                <li key={`${label}-${index}`}>
                  • {label}
                  {value ? `: ${String(value)}` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
