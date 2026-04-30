"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Brand, ZealyEvent } from "@/types";

export default function BrandActivityPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [events, setEvents] = useState<ZealyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [brandList, brandDetail, eventList] = await Promise.all([
          client.listMyBrands(),
          client.getBrand(brandId),
          client.listZealyEvents(brandId),
        ]);
        setBrands(brandList);
        setBrand(brandDetail);
        setEvents(Array.isArray(eventList) ? eventList : []);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load activity";
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

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Activity</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to view recent activity.
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
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Activity
        </p>
        <h1 className="text-2xl font-bold text-white">Zealy Events</h1>
        <p className="text-sm text-zinc-400">
          Recent webhook events and processing status.
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
      {!loading && !events.length && (
        <div className="card p-4 text-sm text-zinc-400">
          No webhook events yet.
        </div>
      )}
      <div className="space-y-3">
        {events.map((event, idx) => (
          <div
            key={event.id ?? `${event.type ?? "event"}-${idx}`}
            className="card p-4 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {event.type ?? "Event"}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Created: {event.createdAt ?? "—"}
                </p>
              </div>
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200">
                {event.status ?? "unknown"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-xs text-zinc-300">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-zinc-500">Zealy Quest ID</p>
                <p className="mt-1 break-all text-zinc-100">
                  {event.zealyQuestId ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-zinc-500">Wallet</p>
                <p className="mt-1 break-all text-zinc-100">
                  {event.walletAddress ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-zinc-500">Processed</p>
                <p className="mt-1 break-all text-zinc-100">
                  {event.processedAt ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-zinc-500">Event ID</p>
                <p className="mt-1 break-all text-zinc-100">
                  {event.id ?? "—"}
                </p>
              </div>
            </div>
            {event.payload && (
              <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
                  Payload
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <DashboardShell brands={brands} brandId={brandId} brandName={brand?.name}>
      {content}
    </DashboardShell>
  );
}
