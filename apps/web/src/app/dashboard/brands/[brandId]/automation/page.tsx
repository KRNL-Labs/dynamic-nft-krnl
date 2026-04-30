"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Brand } from "@/types";

type HealthResponse = {
  ok?: boolean;
  ready?: boolean;
  status?: string;
  message?: string;
  error?: string;
};

type AutomationResponse = {
  krnlSenderAddress?: string;
};

type ReadyState = "checking" | "ready" | "not_ready" | "unknown";

export default function AutomationPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendReady, setBackendReady] = useState<ReadyState>("checking");
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const [senderAddress, setSenderAddress] = useState<string | null>(null);

  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111";
  const krnlNodeUrl = process.env.NEXT_PUBLIC_KRNL_NODE_URL ?? "";
  const platformSenderEnv =
    process.env.NEXT_PUBLIC_PLATFORM_SENDER_ADDRESS ?? "";

  const resolvedSender = useMemo(() => {
    if (platformSenderEnv) return platformSenderEnv;
    if (senderAddress) return senderAddress;
    return "Not configured";
  }, [platformSenderEnv, senderAddress]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandList, brandDetail] = await Promise.all([
        apiFetch<Brand[]>("/api/brands/me"),
        apiFetch<Brand>(`/api/brands/${brandId}`),
      ]);
      setBrands(brandList);
      setBrand(brandDetail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load status";
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [brandId, toast]);

  const checkBackend = useCallback(async () => {
    setBackendReady("checking");
    setBackendMessage(null);
    try {
      const health = await apiFetch<HealthResponse>("/api/health");
      const ready =
        health.ready === true ||
        health.ok === true ||
        String(health.status ?? "").toLowerCase() === "ok";
      setBackendReady(ready ? "ready" : "not_ready");
      setBackendMessage(
        health.message ??
          health.error ??
          (ready ? "Backend ready" : "Backend not ready"),
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Backend health check unavailable";
      setBackendReady("unknown");
      setBackendMessage(msg);
    }
  }, []);

  const loadSenderAddress = useCallback(async () => {
    try {
      const automation = await apiFetch<AutomationResponse>(
        `/api/brands/${brandId}/automation`,
      );
      setSenderAddress(automation.krnlSenderAddress ?? null);
    } catch {
      setSenderAddress(null);
    }
  }, [brandId]);


  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;
    void load();
    void checkBackend();
    void loadSenderAddress();
  }, [
    auth.isAuthenticated,
    auth.walletAddress,
    portal.portalReady,
    portal.portalType,
    load,
    checkBackend,
    loadSenderAddress,
  ]);

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Admin NFT Settings</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to manage global NFT settings.
          </p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  const statusBadge =
    backendReady === "ready"
      ? "bg-green-500/20 text-green-200"
      : backendReady === "not_ready"
        ? "bg-red-500/20 text-red-200"
        : "bg-zinc-800 text-zinc-300";

  const statusLabel =
    backendReady === "ready"
      ? "Ready"
      : backendReady === "not_ready"
        ? "Not Ready"
        : backendReady === "checking"
          ? "Checking"
          : "Unknown";

  const content = (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Platform
        </p>
        <h1 className="text-2xl font-bold text-white">Admin NFT Settings</h1>
        <p className="text-sm text-zinc-400">
          Global metadata configuration and executor readiness.
        </p>
        <p className="text-sm text-zinc-400">
          Workflows are executed server-side by the platform executor.
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
      <div className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Backend Status
            </p>
            <h3 className="text-lg font-semibold text-white">
              Executor Readiness
            </h3>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge}`}>
            {statusLabel}
          </span>
        </div>
        {backendMessage && (
          <p className="text-sm text-zinc-400">{backendMessage}</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Chain ID
            </p>
            <p className="mt-2 text-zinc-100">{chainId}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              KRNL Node URL
            </p>
            <p className="mt-2 break-all text-zinc-100">
              {krnlNodeUrl || "Not configured"}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Platform Sender
            </p>
            <p className="mt-2 break-all text-zinc-100">{resolvedSender}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Health Check
            </p>
            <button
              className="btn-secondary mt-2"
              type="button"
              onClick={checkBackend}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

    </div>
  );

  return (
    <DashboardShell brands={brands} brandId={brandId} brandName={brand?.name}>
      {content}
    </DashboardShell>
  );
}
