"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { client } from "@/lib/client";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { WorkflowDetail } from "@/types";
import { isApiError } from "@/lib/api";
import WalletRequiredDebug from "@/components/wallet-required-debug";

export default function OwnerRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const router = useRouter();

  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "owner") return;
    if (!runId || runId === "undefined") {
      setError("Invalid run id.");
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await client.getUserRunDetail(runId);
        setDetail(data);
      } catch (err) {
        if (isApiError(err) && err.status === 409) {
          router.replace("/select-portal");
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Failed to load run detail";
        setError(msg);
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
    runId,
    router,
  ]);

  if (!auth.isAuthenticated) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Run detail</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Login to view this run.
        </p>
        <button onClick={auth.login} className="btn-primary mt-4">
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Workflow run
          </p>
          <h1 className="text-2xl font-bold text-white">Run Details</h1>
        </div>
        <button className="btn-secondary" onClick={() => router.back()}>
          Back
        </button>
      </div>

      {loading && (
        <div className="card p-4 text-sm text-zinc-400">Loading...</div>
      )}
      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {error === "Wallet required" ? (
            <WalletRequiredDebug onRefresh={() => router.refresh()} />
          ) : (
            error
          )}
        </div>
      )}
      {detail && (
        <div className="card space-y-3 p-4 text-sm text-zinc-300">
          <div>
            <p className="text-xs text-zinc-500">Run ID</p>
            <p className="break-all text-zinc-100">{detail.runId}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500">Status</p>
              <p className="text-zinc-100">{detail.status ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Tx Hash</p>
              <p className="break-all text-zinc-100">
                {detail.chainTxHash ?? detail.txHash ?? "—"}
              </p>
            </div>
          </div>
          {detail.errorMessage && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              {detail.errorMessage}
            </div>
          )}
          {(detail.metadata || detail.renderedWorkflowJson) && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Payload
              </p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-200">
                {JSON.stringify(
                  detail.metadata ?? detail.renderedWorkflowJson,
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
