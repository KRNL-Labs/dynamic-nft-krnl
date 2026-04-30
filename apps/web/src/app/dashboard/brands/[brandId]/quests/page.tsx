"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Brand, Quest } from "@/types";

export default function BrandQuestsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [brandList, brandDetail, questData] = await Promise.all([
          client.listMyBrands(),
          client.getBrand(brandId),
          client.listZealyQuests(brandId).catch(() => client.listQuests(brandId)),
        ]);
        const questList = Array.isArray(questData) ? questData : [];
        if (!Array.isArray(questData)) {
          console.warn("[Quests] quests response not array", questData);
        }
        setBrands(brandList);
        setBrand(brandDetail);
        setQuests(questList);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load quests";
        setError(msg);
        toast.addToast(msg, "error");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [
    auth.isAuthenticated,
    auth.walletAddress,
    portal.portalReady,
    portal.portalType,
    brandId,
    toast,
  ]);

  const syncQuests = async () => {
    setSyncing(true);
    try {
      await client.syncZealyQuests(brandId);
      const questList = await client.listZealyQuests(brandId).catch(() =>
        client.listQuests(brandId),
      );
      setQuests(Array.isArray(questList) ? questList : []);
      toast.addToast("Synced quests from Zealy", "success");
    } catch (err) {
      toast.addToast(
        err instanceof Error ? err.message : "Failed to sync quests",
        "error",
      );
    } finally {
      setSyncing(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Quests</h1>
          <p className="mt-2 text-sm text-zinc-400">Login to review synced quests.</p>
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
        <p className="text-xs uppercase tracking-wide text-zinc-500">Quests</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">Synced Quests</h1>
          <button
            className="btn-secondary"
            type="button"
            onClick={syncQuests}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync from Zealy"}
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          Quest XP is configured in Zealy and used as currency here.
        </p>
      </div>

      <div className="card border-red-500/30 bg-red-600/5 p-4 text-sm text-zinc-300">
        Reward rules are now configured in the <span className="text-white">Lootbox</span> tab.
        This page is a read-only view of synced Zealy quests.
      </div>

      {loading && <div className="card p-4 text-sm text-zinc-400">Loading...</div>}

      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="grid gap-3">
        {quests.map((quest) => (
          <div key={quest.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{quest.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Quest ID: {quest.zealyQuestId ?? quest.id}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Zealy XP: {quest.xp ?? quest.xpReward ?? "—"}
                </p>
              </div>
            </div>
          </div>
        ))}

        {!loading && !quests.length && (
          <div className="card p-4 text-sm text-zinc-400">
            No quests yet. Click Sync from Zealy.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardShell brands={brands} brandId={brandId} brandName={brand?.name}>
      {content}
    </DashboardShell>
  );
}
