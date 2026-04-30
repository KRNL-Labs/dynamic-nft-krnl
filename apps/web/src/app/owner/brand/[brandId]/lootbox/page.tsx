"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import OwnerShell from "@/components/owner-shell";
import PortalGate from "@/components/portal-gate";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { clearOwnerSelectedBrandId, setOwnerSelectedBrandId } from "@/lib/owner-brand";
import { useToast } from "@/components/toast";

function getTraitLabel(item: Record<string, unknown>): string {
  const name =
    (item.traitName as string | undefined) ??
    (item.traitKey as string | undefined) ??
    (item.name as string | undefined) ??
    "Trait";
  const value =
    (item.traitValue as string | number | undefined) ??
    (item.value as string | number | undefined);
  return value === undefined || value === null || value === ""
    ? name
    : `${name}: ${String(value)}`;
}

function getTraitImageUrl(item: Record<string, unknown>): string | null {
  const candidates = [
    item.imageUrl,
    item.image_url,
    item.publicUrl,
    item.public_url,
    item.url,
    item.traitImageUrl,
    item.previewImageUrl,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function pickBalance(
  data: Record<string, unknown> | undefined,
  keys: string[],
): number | string {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return "—";
}

export default function OwnerBrandLootboxPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const router = useRouter();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [unlockedTraits, setUnlockedTraits] = useState<Array<Record<string, unknown>>>([]);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [lootboxFlashVisible, setLootboxFlashVisible] = useState(false);
  const [lootboxFlashFading, setLootboxFlashFading] = useState(false);
  const flashFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { data: balancesData, mutate: refreshBalances, error: balancesError } = useSWR(
    ownerEnabled ? `/api/me/balances?brandId=${brandId}` : null,
    () => client.getOwnerBalances(brandId),
    { refreshInterval: 0, revalidateOnFocus: true },
  );

  const { mutate: refreshTraits } = useSWR(
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

  useEffect(() => {
    return () => {
      if (flashFadeTimerRef.current) {
        clearTimeout(flashFadeTimerRef.current);
      }
      if (flashHideTimerRef.current) {
        clearTimeout(flashHideTimerRef.current);
      }
    };
  }, []);

  const xpBalance = pickBalance(
    balancesData as unknown as Record<string, unknown> | undefined,
    ["xpBalance", "xpAvailable", "availableXp", "xp", "xpTotal"],
  );
  const lootKeysBalance = pickBalance(
    balancesData as unknown as Record<string, unknown> | undefined,
    ["lootKeysBalance", "lootKeys", "keys"],
  );

  const handleBuy = async () => {
    if (!brandId) return;
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }

    setBuying(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await client.buyLootKeys({ brandId, quantity });
      await Promise.all([refreshBalances(), refreshTraits()]);
      const spent = response.spentXp ?? 0;
      const newKeys =
        response.newLootKeys ??
        response.newBalance ??
        response.lootKeys ??
        response.balance ??
        "updated";
      const message = `Bought ${quantity} lootkey${quantity > 1 ? "s" : ""}. XP spent: ${spent}. New lootkeys: ${newKeys}.`;
      setSuccess(message);
      toast.addToast("Lootkeys purchased", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to buy lootkeys.";
      setError(message);
      toast.addToast(message, "error");
    } finally {
      setBuying(false);
    }
  };

  const handleOpenLootbox = async () => {
    if (!brandId) return;
    if (flashFadeTimerRef.current) {
      clearTimeout(flashFadeTimerRef.current);
    }
    if (flashHideTimerRef.current) {
      clearTimeout(flashHideTimerRef.current);
    }
    setLootboxFlashVisible(true);
    setLootboxFlashFading(false);
    flashFadeTimerRef.current = setTimeout(() => {
      setLootboxFlashFading(true);
    }, 180);
    flashHideTimerRef.current = setTimeout(() => {
      setLootboxFlashVisible(false);
      setLootboxFlashFading(false);
    }, 1300);

    setOpening(true);
    setError(null);
    setSuccess(null);
    setUnlockedTraits([]);
    setShowUnlockModal(false);
    try {
      const response = await client.openLootbox(brandId);
      const unlocked = Array.isArray(response.unlockedTraits)
        ? response.unlockedTraits
        : Array.isArray(response.traits)
          ? response.traits
          : [];
      setUnlockedTraits(unlocked);
      if (unlocked.length > 0) {
        setShowUnlockModal(true);
      }
      await Promise.all([refreshBalances(), refreshTraits()]);
      toast.addToast("Lootbox submitted", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open lootbox.";
      setError(message);
      toast.addToast(message, "error");
    } finally {
      setOpening(false);
    }
  };

  const content = (
    <div className="space-y-5">
      {showUnlockModal && unlockedTraits.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="card relative w-full max-w-lg p-5">
            <button
              type="button"
              onClick={() => setShowUnlockModal(false)}
              className="absolute right-3 top-3 rounded-full border border-zinc-700 px-2 py-0.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              aria-label="Close popup"
            >
              ×
            </button>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Lootbox Unlock
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              You unlocked a trait
            </h3>
            <div className="mt-4 space-y-3">
              {(() => {
                const trait = unlockedTraits[0];
                const imageUrl = getTraitImageUrl(trait);
                return (
                  <>
                    <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageUrl}
                          alt={getTraitLabel(trait)}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                          Image preview unavailable
                        </div>
                      )}
                    </div>
                    <p className="text-center text-sm text-zinc-200">
                      {getTraitLabel(trait)}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {lootboxFlashVisible && (
        <div
          className={`pointer-events-none fixed inset-0 z-[70] transition-opacity duration-[1100ms] ${
            lootboxFlashFading ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,244,196,0.95)_0%,_rgba(251,191,36,0.78)_34%,_rgba(217,119,6,0.36)_62%,_rgba(0,0,0,0)_82%)]" />
          <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,_rgba(255,255,255,0.45),_rgba(250,204,21,0.2),_rgba(255,255,255,0.38),_rgba(250,204,21,0.2),_rgba(255,255,255,0.45))] mix-blend-screen animate-[spin_0.9s_linear_infinite]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.6)_0%,_rgba(255,255,255,0)_56%)] animate-pulse" />
        </div>
      )}

      <div className="card p-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Lootbox</p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {currentBrand?.name ?? "Brand"}
        </h1>
        <p className="text-sm text-zinc-400">
          Buy lootkeys using XP, then open lootboxes to unlock traits.
        </p>
      </div>

      {balancesError && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {balancesError instanceof Error
            ? balancesError.message
            : "Failed to load balances."}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">XP Balance</p>
          <p className="mt-2 text-2xl font-semibold text-white">{xpBalance}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Lootkeys Balance</p>
          <p className="mt-2 text-2xl font-semibold text-white">{lootKeysBalance}</p>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="text-lg font-semibold text-white">Buy Loot Keys</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value || 1))}
            className="input-dark w-28"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleBuy()}
            disabled={buying}
          >
            {buying ? "Buying..." : "Buy"}
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="group card relative aspect-square w-full max-w-md overflow-hidden p-0 transition-colors duration-300 hover:bg-amber-500/20">
          <div className="absolute inset-0 bg-[url('/images/lootbox.png')] bg-cover bg-center opacity-100" />
          <div className="absolute inset-0 bg-black/45 transition-colors duration-300 group-hover:bg-amber-900/35" />
          <div className="relative z-10 flex h-full flex-col items-center justify-end gap-4 p-6 pb-8 text-center">
            <h2 className="text-lg font-semibold text-white"></h2>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleOpenLootbox()}
              disabled={opening}
            >
              {opening ? "Opening..." : "Open Lootbox"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">{error}</div>
      )}
      {success && (
        <div className="card border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {unlockedTraits.length > 0 && (
        <div className="card space-y-3 p-4">
          <h3 className="text-base font-semibold text-white">Unlocked traits</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {unlockedTraits.map((trait, index) => (
              <div
                key={`unlocked-${index}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-200"
              >
                {getTraitLabel(trait)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <PortalGate portal="owner">
      <OwnerShell headerTitle={currentBrand?.name ?? "Lootbox"} lootKeysBalance={lootKeysBalance}>
        {content}
      </OwnerShell>
    </PortalGate>
  );
}
