"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import ZealyConnectForm from "@/components/zealy-connect-form";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Brand, Quest } from "@/types";

export default function BrandZealyPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [questsLoading, setQuestsLoading] = useState(true);
  const [questsError, setQuestsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQuestsError(null);
    setQuestsLoading(true);
    try {
      const [brandList, brandDetail] = await Promise.all([
        client.listMyBrands(),
        client.getBrand(brandId),
      ]);
      setBrands(brandList);
      setBrand(brandDetail);
      try {
        const questList = await client.listQuests(brandId);
        setQuests(Array.isArray(questList) ? questList : []);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load quests";
        setQuestsError(msg);
        setQuests([]);
      } finally {
        setQuestsLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load brand";
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setLoading(false);
      setQuestsLoading(false);
    }
  }, [brandId, toast]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;
    void load();
  }, [auth.isAuthenticated, auth.walletAddress, portal.portalReady, portal.portalType, load]);

  const handleConnect = async (payload: {
    communityId: string;
    apiKey: string;
    webhookSecret?: string;
  }) => {
    await client.connectZealy(brandId, payload);
    toast.addToast("Zealy connected", "success");
    await load();
  };

  const handleSync = async () => {
    setSyncing(true);
    setQuestsError(null);
    try {
      await client.syncZealyQuests(brandId);
      const questList = await client.listQuests(brandId);
      const nextQuests = Array.isArray(questList) ? questList : [];
      setQuests(nextQuests);
      toast.addToast(`Synced ${nextQuests.length} quests`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sync quests";
      setQuestsError(msg);
      toast.addToast(msg, "error");
    } finally {
      setSyncing(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Connect Zealy</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to manage Zealy integration.
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
        <p className="text-xs uppercase tracking-wide text-zinc-500">Zealy</p>
        <h1 className="text-2xl font-bold text-white">Zealy Settings</h1>
        <p className="text-sm text-zinc-400">
          Add your Zealy community credentials and sync quests.
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
      <ZealyConnectForm
        onSubmit={handleConnect}
        connected={Boolean(
          brand?.hasZealyConfig ||
            brand?.zealyConnected ||
            brand?.zealyCommunityId ||
            brand?.zealySubdomain,
        )}
        initialCommunityId={brand?.zealyCommunityId ?? brand?.zealySubdomain}
      />
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-white">Quests</h4>
            <p className="text-sm text-zinc-400">
              Sync and review quests from Zealy.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync Quests"}
          </button>
        </div>
        {questsLoading ? (
          <div className="text-sm text-zinc-400">Loading quests...</div>
        ) : questsError ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {questsError}
          </div>
        ) : quests.length === 0 ? (
          <div className="text-sm text-zinc-400">
            No quests synced yet. Click Sync Quests.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {quests.map((quest) => (
              <li
                key={quest.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-zinc-200"
              >
                <span className="font-medium text-white">{quest.title}</span>
                <span className="text-xs text-zinc-500">
                  {quest.zealyQuestId ?? "No Zealy ID"}
                </span>
              </li>
            ))}
          </ul>
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
