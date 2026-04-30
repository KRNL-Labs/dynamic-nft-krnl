"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import StatusCard from "@/components/status-card";
import DataTable from "@/components/data-table";
import SetupChecklist from "@/components/setup-checklist";
import { client } from "@/lib/client";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { useToast } from "@/components/toast";
import { AssetPack, Brand, Quest, WorkflowRun } from "@/types";

function hasLootboxConfig(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  const value = config as {
    configured?: unknown;
    isConfigured?: unknown;
    enabled?: unknown;
    xpPerLootKey?: unknown;
    xpCostToOpen?: unknown;
    lootKeysPerOpen?: unknown;
    maxUnlocksPerOpen?: unknown;
    lootTable?: unknown;
    items?: unknown;
  };

  if (value.configured === true || value.isConfigured === true) return true;

  // Explicit disable is a real saved choice.
  if (value.enabled === false) return true;

  if (Array.isArray(value.items) && value.items.length > 0) return true;
  if (Array.isArray(value.lootTable) && value.lootTable.length > 0) return true;
  if (
    value.lootTable &&
    typeof value.lootTable === "object" &&
    "entries" in value.lootTable
  ) {
    const entries = (value.lootTable as { entries?: unknown }).entries;
    if (Array.isArray(entries) && entries.length > 0) return true;
  }

  // Defaults should not be treated as configured.
  const DEFAULT_XP_PER_LOOTKEY = 100;
  const DEFAULT_LOOTKEYS_PER_OPEN = 1;
  const DEFAULT_MAX_UNLOCKS_PER_OPEN = 1;
  const xpPerLootKey =
    typeof value.xpPerLootKey === "number"
      ? value.xpPerLootKey
      : typeof value.xpCostToOpen === "number"
        ? value.xpCostToOpen
        : null;
  const lootKeysPerOpen =
    typeof value.lootKeysPerOpen === "number" ? value.lootKeysPerOpen : null;
  const maxUnlocksPerOpen =
    typeof value.maxUnlocksPerOpen === "number"
      ? value.maxUnlocksPerOpen
      : null;

  if (xpPerLootKey !== null && xpPerLootKey !== DEFAULT_XP_PER_LOOTKEY) {
    return true;
  }
  if (
    lootKeysPerOpen !== null &&
    lootKeysPerOpen !== DEFAULT_LOOTKEYS_PER_OPEN
  ) {
    return true;
  }
  if (
    maxUnlocksPerOpen !== null &&
    maxUnlocksPerOpen !== DEFAULT_MAX_UNLOCKS_PER_OPEN
  ) {
    return true;
  }

  return false;
}

export default function BrandOverviewPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [credits, setCredits] = useState<number | undefined>(undefined);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [assetPacks, setAssetPacks] = useState<AssetPack[]>([]);
  const [lootboxConfigured, setLootboxConfigured] = useState(false);
  const [rewardConfigured, setRewardConfigured] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowRun[]>([]);
  const [krnlConfigured, setKrnlConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [brandListRes, brandDetailRes, creditsRes, workflowRunsRes, lootboxConfig] =
          await Promise.all([
            client.listMyBrands().catch(() => []),
            client.getBrand(brandId),
            client.getCredits(brandId),
            client.listWorkflows(brandId).catch(() => [] as WorkflowRun[]),
            client.getLootboxConfig(brandId).catch(() => ({})),
          ]);

        setBrands(
          brandListRes.length ? brandListRes : brandDetailRes ? [brandDetailRes] : [],
        );
        setBrand(brandDetailRes);
        setCredits(creditsRes.credits);

        setWorkflows((workflowRunsRes || []).slice(0, 5));
        setLootboxConfigured(hasLootboxConfig(lootboxConfig));

        if (workflowRunsRes && workflowRunsRes.length > 0) {
          const latestRun = workflowRunsRes[0];
          const runId = (latestRun as { id?: string }).id ?? "";
          const validRunId =
            typeof runId === "string" &&
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
              runId,
            );
          if (latestRun.status === "failed" && validRunId) {
            try {
              const latestDetail = await client.getWorkflowDetail(
                brandId,
                runId,
              );
              const detailText = JSON.stringify(latestDetail).toLowerCase();
              const invalid =
                detailText.includes("invalid") ||
                detailText.includes("missing");
              setKrnlConfigured(!invalid);
            } catch (err) {
              console.error("Failed to load latest workflow detail", err);
              setKrnlConfigured(null);
            }
          } else if (latestRun.status === "failed" && !validRunId) {
            setKrnlConfigured(null);
          } else {
            setKrnlConfigured(true);
          }
        } else {
          setKrnlConfigured(null);
        }

        let questList: Quest[] = [];
        try {
          questList = await client.listQuests(brandId);
        } catch (err) {
          console.error("Failed to load quests", err);
          questList = [];
        }
        setQuests(questList);

        let packs: AssetPack[] = [];
        try {
          packs = await client.listAssetPacks(brandId);
        } catch (err) {
          console.error("Failed to load asset packs", err);
          packs = [];
        }
        setAssetPacks(packs);

        if (questList.length > 0) {
          try {
            await client.getRewardRule(brandId, questList[0].id);
            setRewardConfigured(true);
          } catch {
            setRewardConfigured(false);
          }
        } else {
          setRewardConfigured(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load brand";
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

  const hasNft = useMemo(() => brand?.nftConfigured, [brand]);
  const zealyDone = brand?.hasZealyConfig ?? brand?.zealyConnected ?? false;
  const questsDone = quests.length > 0;
  const assetsDone = assetPacks.length > 0;
  const creditsDone = typeof credits === "number" && credits > 0;
  const isLootboxConfigured =
    lootboxConfigured || Boolean(brand?.lootboxConfigured);

  const checklistItems = [
    {
      label: "Zealy connected",
      complete: zealyDone,
      href: `/dashboard/brand/${brandId}/zealy`,
    },
    {
      label: "Quests synced",
      complete: questsDone,
      href: `/dashboard/brand/${brandId}/quests`,
    },
    {
      label: "Asset pack added",
      complete: assetsDone,
      href: `/dashboard/brand/${brandId}/assets`,
    },
    {
      label: "Lootbox configured",
      complete: isLootboxConfigured,
      href: `/dashboard/brand/${brandId}/lootbox`,
    },
    {
      label: "Credits funded",
      complete: creditsDone,
      href: `/dashboard/brand/${brandId}/billing`,
    },
  ];

  const syncQuests = async () => {
    try {
      await client.syncZealyQuests(brandId);
      toast.addToast("Sync triggered", "success");
    } catch (err) {
      toast.addToast(
        err instanceof Error ? err.message : "Failed to sync quests",
        "error",
      );
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">
            Brand dashboard
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to view your brand overview.
          </p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      {loading && (
        <div className="card p-4 text-sm text-zinc-400">Loading...</div>
      )}
      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      {brand && (
        <>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Brand
                </p>
                <h1 className="text-2xl font-bold text-white">{brand.name}</h1>
                {brand.description && (
                  <p className="text-sm text-zinc-400">{brand.description}</p>
                )}
              </div>
              {brand.logoUrl && (
                <div className="h-26 w-26 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brand.logoUrl}
                    alt={brand.name}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/dashboard/brand/${brandId}/nft`} className="btn-secondary">
                NFT Settings
              </Link>
              <Link href={`/dashboard/brand/${brandId}/zealy`} className="btn-secondary">
                Connect Zealy
              </Link>
              {/* <button className="btn-secondary" onClick={syncQuests}>
                Sync quests
              </button> */}
              <Link href={`/dashboard/brand/${brandId}/assets`} className="btn-secondary">
                Add Assets
              </Link>
              <Link href={`/dashboard/brand/${brandId}/lootbox`} className="btn-secondary">
                Configure Lootbox
              </Link>
              <Link href={`/dashboard/brand/${brandId}/billing`} className="btn-secondary">
                Top up credits
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StatusCard
              title="System Status"
              value={
                krnlConfigured === null
                  ? "Good"
                  : krnlConfigured
                    ? "System configured"
                    : "System configured"
              }
              hint={
                krnlConfigured === false
                  ? "Check sender/attestor/bundler/paymaster env vars"
                  : ""
              }
            />
            <StatusCard
              title="Zealy Connected"
              value={
                brand.hasZealyConfig ?? brand.zealyConnected ? "Yes" : "No"
              }
            />
            <StatusCard
              title="NFT Contract"
              value={hasNft ? "Available" : "Available"}
              hint={hasNft ? "" : ""}
            />
            <StatusCard
              title="Asset Packs"
              value={
                typeof brand.assetPackCount === "number"
                  ? brand.assetPackCount
                  : assetPacks.length
              }
            />
            <StatusCard
              title="Lootbox Config"
              value={isLootboxConfigured ? "Set" : "Missing"}
            />
            <StatusCard title="Credits" value={credits ?? "—"} />
          </div>

          <SetupChecklist items={checklistItems} />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Recent KRNL runs
              </h3>
              <Link
                href={`/dashboard/brand/${brandId}/workflows`}
                className="text-sm text-red-400"
              >
                View all
              </Link>
            </div>
            <DataTable
              columns={[
                { header: "Created", key: "createdAt" },
                { header: "Type", key: "type" },
                { header: "Status", key: "status" },
                { header: "Wallet", key: "wallet" },
                { header: "Token", key: "tokenId" },
                {
                  header: "Run",
                  key: "runId",
                  render: (row) =>
                    (() => {
                      const runId =
                        (row as { id?: string }).id ??
                        (row as { runId?: string }).runId ??
                        "";
                      const valid =
                        typeof runId === "string" &&
                        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
                          runId,
                        );
                      return valid ? `${runId.slice(0, 6)}...` : "—";
                    })(),
                },
              ]}
              data={workflows}
            />
          </div>
        </>
      )}
    </div>
  );

  return (
    <DashboardShell
      brands={brands}
      brandId={brandId}
      brandName={brand?.name}
      credits={credits}
    >
      {content}
    </DashboardShell>
  );
}
