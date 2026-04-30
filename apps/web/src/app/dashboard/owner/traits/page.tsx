"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { TraitSchemaItem, UserTrait } from "@/types";
import { isApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import WalletRequiredDebug from "@/components/wallet-required-debug";
import { getOwnerSelectedBrandId } from "@/lib/owner-brand";

type TraitCard = {
  id: string;
  trait: UserTrait;
};

export default function OwnerTraitsPage() {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();
  const router = useRouter();

  const [opening, setOpening] = useState(false);
  const [activating, setActivating] = useState(false);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [brandChecked, setBrandChecked] = useState(false);
  const [unlockedTraits, setUnlockedTraits] = useState<Array<Record<string, unknown>>>(
    [],
  );

  const traitsFetcher = () =>
    selectedBrandId ? client.listUserTraits(selectedBrandId) : client.listUserTraits();
  const profileFetcher = () =>
    selectedBrandId ? client.getUserProfile(selectedBrandId) : client.getUserProfile();
  const traitSchemaFetcher = () => client.getTraitSchema();

  const {
    data: traitsData,
    error: traitsError,
    mutate: refreshTraits,
    isValidating: traitsValidating,
  } = useSWR(
    auth.isAuthenticated &&
      auth.walletAddress &&
      portal.portalReady &&
      portal.portalType === "owner" &&
      !!selectedBrandId
      ? `/api/me/traits?brandId=${selectedBrandId}`
      : null,
    traitsFetcher,
    {
    refreshInterval: 0,
    revalidateOnFocus: true,
  });

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

  const {
    data: traitSchemaData,
    error: traitSchemaError,
    isValidating: traitSchemaValidating,
  } = useSWR(
    auth.isAuthenticated &&
      auth.walletAddress &&
      portal.portalReady &&
      portal.portalType === "owner" &&
      !!selectedBrandId
      ? "/api/traits/schema"
      : null,
    traitSchemaFetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
    },
  );

  const traitCards = useMemo<TraitCard[]>(() => {
    const list = Array.isArray(traitsData) ? traitsData : [];
    return list.map((trait, index) => ({
      id:
        trait.id ??
        trait.traitId ??
        trait.traitKey ??
        trait.name ??
        `trait-${index}`,
      trait,
    }));
  }, [traitsData]);

  const lootKeys = profile?.lootKeys ?? 0;
  const canOpen = lootKeys > 0 && !opening;

  useEffect(() => {
    const stored = getOwnerSelectedBrandId();
    setSelectedBrandId(stored);
    setBrandChecked(true);
    if (!stored) {
      router.replace("/owner/brands");
    }
  }, [router]);

  const schemaItems = useMemo<TraitSchemaItem[]>(() => {
    if (!traitSchemaData) return [];
    if (Array.isArray(traitSchemaData)) return traitSchemaData;
    const typed = traitSchemaData as {
      traits?: TraitSchemaItem[];
      items?: TraitSchemaItem[];
      data?: TraitSchemaItem[];
    };
    return typed.traits ?? typed.items ?? typed.data ?? [];
  }, [traitSchemaData]);

  useEffect(() => {
    const err = traitsError;
    if (!err) return;
    if (isApiError(err) && err.status === 409) {
      router.replace("/select-portal");
    }
  }, [traitsError, router]);

  const toggleTrait = (traitId: string) => {
    setSelectedTraits((prev) =>
      prev.includes(traitId)
        ? prev.filter((id) => id !== traitId)
        : [...prev, traitId],
    );
  };

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

  const handleActivate = async () => {
    if (selectedTraits.length === 0) {
      toast.addToast("Select at least one trait to activate.", "error");
      return;
    }
    if (!selectedBrandId) {
      toast.addToast("Select a brand first.", "error");
      return;
    }
    setActivating(true);
    try {
      await client.activateUserTraits(
        selectedTraits,
        selectedBrandId,
      );
      toast.addToast(
        "Traits activated.",
        "success",
      );
      await refreshTraits();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to activate traits";
      toast.addToast(msg, "error");
    } finally {
      setActivating(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Traits</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Login to manage your traits.
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
          Unlocked Traits
        </p>
        <h1 className="text-2xl font-bold text-white">Manage Traits</h1>
        <p className="text-sm text-zinc-400">
          Select unlocked traits and set them active.
        </p>
      </div>

      {traitsError && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {isApiError(traitsError) && traitsError.status === 400 ? (
            <WalletRequiredDebug onRefresh={() => router.refresh()} />
          ) : (
            (traitsError instanceof Error && traitsError.message) ||
            "Failed to load data"
          )}
        </div>
      )}

      <details className="card p-4">
        <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-white">
          Trait schema
          <span className="text-xs font-normal text-zinc-500">
            {traitSchemaValidating
              ? "Loading..."
              : `${schemaItems.length} traits`}
          </span>
        </summary>
        <div className="mt-3 space-y-3 text-sm text-zinc-300">
          {traitSchemaError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              {(traitSchemaError as Error).message ??
                "Failed to load trait schema"}
            </div>
          )}
          {!traitSchemaError && schemaItems.length === 0 && (
            <p className="text-sm text-zinc-400">No schema available.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {schemaItems.map((trait, index) => {
              const label =
                trait.label ??
                trait.name ??
                trait.traitKey ??
                trait.key ??
                trait.id ??
                `Trait ${index + 1}`;
              const constraintSource =
                trait.constraints ?? trait.options ?? trait.values;
              const constraintText =
                typeof constraintSource === "string"
                  ? constraintSource
                  : constraintSource
                    ? JSON.stringify(constraintSource)
                    : "—";
              return (
                <div
                  key={`${label}-${index}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300"
                >
                  <p className="text-zinc-500">Trait</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {label}
                  </p>
                  <p className="mt-2 text-zinc-500">Constraints</p>
                  <p className="mt-1 break-words text-zinc-100">
                    {constraintText}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </details>

      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Unlocked Traits
            </h2>
            <p className="text-sm text-zinc-400">
              Choose one or more traits to activate.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => void handleActivate()}
            disabled={activating || selectedTraits.length === 0}
          >
            {activating ? "Setting..." : "Set Active"}
          </button>
        </div>
        {traitsValidating && (
          <p className="text-xs text-zinc-500">Refreshing traits…</p>
        )}
        {traitCards.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            No traits unlocked yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {traitCards.map(({ id, trait }) => {
              const active = selectedTraits.includes(id);
              const title =
                trait.name ?? trait.traitKey ?? trait.id ?? "Trait";
              const subtitle =
                trait.traitValue ?? trait.description ?? "Unlocked trait";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleTrait(id)}
                  className={`group flex h-full flex-col rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-red-500/60 bg-red-600/10"
                      : "border-zinc-800 bg-zinc-900/60 hover:border-red-500/40"
                  }`}
                >
                  {trait.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={trait.imageUrl}
                      alt={typeof title === "string" ? title : "Trait"}
                      className="h-28 w-full rounded-xl object-cover"
                    />
                  )}
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {typeof subtitle === "string" && subtitle.length > 0
                          ? subtitle
                          : "Unlocked trait"}
                      </p>
                    </div>
                    <span
                      className={`mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                        active
                          ? "border-red-400 text-red-200"
                          : "border-zinc-700 text-zinc-500"
                      }`}
                    >
                      {active ? "✓" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Lootbox</h2>
            <p className="text-sm text-zinc-400">
              Loot keys available: {lootKeys}
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
