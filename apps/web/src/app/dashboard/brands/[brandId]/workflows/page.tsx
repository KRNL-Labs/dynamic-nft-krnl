"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import DashboardShell from "@/components/dashboard-shell";
import Modal from "@/components/modal";
import JsonViewer from "@/components/json-viewer";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { isApiError } from "@/lib/api";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Brand, WorkflowDetail, WorkflowRun } from "@/types";

export default function BrandWorkflowsPage() {
  const { brandId, runId: routeRunId } = useParams<{
    brandId: string;
    runId?: string;
  }>();
  const router = useRouter();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [handledRunId, setHandledRunId] = useState<string | null>(null);
  const [routeWarning, setRouteWarning] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const detailPollRef = useRef<number | null>(null);

  const getRunId = (run: WorkflowRun | null) => {
    if (!run) return "";
    const primary = run.id ?? run.runId ?? "";
    if (typeof primary === "string" && primary.trim()) return primary.trim();
    return "";
  };

  const getRunKey = (run: WorkflowRun) => {
    return (
      run.id ??
      run.runId ??
      run.krnlRequestId ??
      run.requestId ??
      run.krnlIntentId ??
      run.intentId ??
      run.createdAt ??
      ""
    );
  };

  const statusInfo = (status?: string | null) => {
    const normalized = (status ?? "").toLowerCase();
    switch (normalized) {
      case "queued":
      case "pending":
      case "submitted":
        return { label: status ?? "Queued", cls: "bg-zinc-800 text-zinc-200" };
      case "running":
      case "in_progress":
        return { label: status ?? "Running", cls: "bg-blue-500/20 text-blue-200" };
      case "succeeded":
      case "success":
        return { label: status ?? "Succeeded", cls: "bg-green-500/20 text-green-200" };
      case "failed":
      case "error":
        return { label: status ?? "Failed", cls: "bg-red-500/20 text-red-200" };
      default:
        return { label: status ?? "Unknown", cls: "bg-zinc-800 text-zinc-200" };
    }
  };

  const isValidRunId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "undefined") return false;
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
      trimmed,
    );
  };

  const invalidHint = (() => {
    if (!detail || selectedRun?.status !== "failed") return null;
    const combined = JSON.stringify(detail).toLowerCase();
    if (combined.includes("invalid") || combined.includes("missing")) {
      return "KRNL config missing: check sender/attestor/bundler/paymaster env vars.";
    }
    return null;
  })();

  const isPendingStatus = useCallback((status?: string | null) => {
    const normalized = (status ?? "").toLowerCase();
    return ["queued", "pending", "running", "submitted", "processing", "in_progress"].includes(
      normalized,
    );
  }, []);

  const isTerminalStatus = useCallback((status?: string | null) => {
    const normalized = (status ?? "").toLowerCase();
    return ["failed", "failed_timeout", "error", "succeeded", "success"].includes(
      normalized,
    );
  }, []);

  const hasPending = useMemo(() => {
    if (!Array.isArray(runs)) return false;
    return runs.some((run) => {
      const confirmed =
        (run.onchainVerification ?? "").toUpperCase() === "CONFIRMED_ONCHAIN" ||
        run.onchainVerified === true;
      if (confirmed) return false;
      return isPendingStatus(run.status ?? "");
    });
  }, [runs, isPendingStatus]);

  const jsonEqual = (a?: Record<string, unknown> | null, b?: Record<string, unknown> | null) => {
    if (a === b) return true;
    if (!a || !b) return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  };

  const mergeRuns = useCallback(
    (prevRuns: WorkflowRun[], nextRuns: WorkflowRun[]) => {
      const prevMap = new Map<string, WorkflowRun>();
      prevRuns.forEach((run) => {
        prevMap.set(getRunKey(run), run);
      });
      let changed = false;
      const merged = nextRuns.map((next) => {
        const key = getRunKey(next);
        const prev = prevMap.get(key);
        if (!prev) {
          changed = true;
          return next;
        }
        const changedRow =
          prev.status !== next.status ||
          prev.chainTxHash !== next.chainTxHash ||
          prev.txHash !== next.txHash ||
          prev.krnlRequestId !== next.krnlRequestId ||
          prev.krnlIntentId !== next.krnlIntentId ||
          prev.requestId !== next.requestId ||
          prev.intentId !== next.intentId ||
          prev.onchainVerification !== next.onchainVerification ||
          prev.onchainVerified !== next.onchainVerified ||
          prev.metadataBaseURI !== next.metadataBaseURI ||
          prev.onchainMetadataBaseURI !== next.onchainMetadataBaseURI ||
          prev.updatedAt !== next.updatedAt ||
          prev.createdAt !== next.createdAt ||
          prev.errorMessage !== next.errorMessage ||
          prev.type !== next.type ||
          !jsonEqual(prev.krnlStatusJson, next.krnlStatusJson);
        if (!changedRow) return prev;
        changed = true;
        return { ...prev, ...next };
      });
      const sameOrder =
        prevRuns.length === merged.length &&
        merged.every((item, idx) => item === prevRuns[idx]);
      if (!changed && sameOrder) {
        return { merged: prevRuns, changed: false };
      }
      return { merged, changed: true };
    },
    [],
  );

  const applyRuns = useCallback(
    (nextRuns: WorkflowRun[]) => {
      let didChange = false;
      setRuns((prev) => {
        if (!Array.isArray(prev)) {
          didChange = true;
          return nextRuns;
        }
        const result = mergeRuns(prev, nextRuns);
        didChange = result.changed;
        return result.merged;
      });
      if (didChange) {
        setLastUpdated(new Date());
      }
    },
    [mergeRuns],
  );

  const openDetailById = useCallback(
    async (runId: string, run?: WorkflowRun) => {
      setRouteWarning(null);
      setDetailOpen(true);
      setDetail(null);
      setDetailError(null);
      setSelectedRun(
        runId ? ({ ...(run ?? {}), runId } as WorkflowRun) : null,
      );
      if (!isValidRunId(runId)) {
        setSelectedRun(null);
        setDetailError("Select a workflow run to view details");
        return;
      }
      try {
        const detailData = await client.getWorkflowDetail(brandId, runId);
        setDetail(detailData);
      } catch (err) {
        if (isApiError(err) && err.status === 400) {
          setDetailError(err.message || "Invalid workflow run id");
          return;
        }
        setDetailError(
          err instanceof Error ? err.message : "Failed to load run detail",
        );
      }
    },
    [brandId],
  );

  const applyDetailToRun = useCallback(
    (runId: string, detailData: WorkflowDetail) => {
      const detailStatus = detailData.status;
      const detailTxHash =
        detailData.chainTxHash ?? detailData.txHash ?? null;
      const detailErrorMsg = detailData.errorMessage;
      const detailOnchain = detailData.onchainVerification;
      const detailOnchainVerified = detailData.onchainVerified;
      const detailRequestId =
        detailData.requestId ?? detailData.krnlRequestId ?? null;
      const detailIntentId =
        detailData.intentId ?? detailData.krnlIntentId ?? null;
      setSelectedRun((prev) =>
        prev && getRunId(prev) === runId
          ? {
              ...prev,
              status: detailStatus ?? prev.status,
              chainTxHash: detailTxHash ?? prev.chainTxHash,
              errorMessage: detailErrorMsg ?? prev.errorMessage,
              onchainVerification: detailOnchain ?? prev.onchainVerification,
              onchainVerified: detailOnchainVerified ?? prev.onchainVerified,
              krnlStatus: detailData.krnlStatus ?? prev.krnlStatus,
              requestId: detailRequestId ?? prev.requestId,
              intentId: detailIntentId ?? prev.intentId,
              metadataBaseURI:
                detailData.metadataBaseURI ?? prev.metadataBaseURI,
              onchainMetadataBaseURI:
                detailData.onchainMetadataBaseURI ??
                prev.onchainMetadataBaseURI,
            }
          : prev,
      );
      setRuns((prev) =>
        Array.isArray(prev)
          ? prev.map((run) =>
              getRunId(run) === runId
                ? {
                    ...run,
                    status: detailStatus ?? run.status,
                    chainTxHash: detailTxHash ?? run.chainTxHash,
                    errorMessage: detailErrorMsg ?? run.errorMessage,
                    onchainVerification:
                      detailOnchain ?? run.onchainVerification,
                    onchainVerified:
                      detailOnchainVerified ?? run.onchainVerified,
                    krnlStatus: detailData.krnlStatus ?? run.krnlStatus,
                    requestId: detailRequestId ?? run.requestId,
                    intentId: detailIntentId ?? run.intentId,
                    metadataBaseURI:
                      detailData.metadataBaseURI ?? run.metadataBaseURI,
                    onchainMetadataBaseURI:
                      detailData.onchainMetadataBaseURI ??
                      run.onchainMetadataBaseURI,
                  }
                : run,
            )
          : prev,
      );
    },
    [getRunId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandList, brandDetail] = await Promise.all([
        client.listMyBrands(),
        client.getBrand(brandId),
      ]);
      setBrands(brandList);
      setBrand(brandDetail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load workflows";
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [brandId, toast, applyRuns]);

  const listFetcher = useCallback(() => client.listWorkflows(brandId), [brandId]);

  const {
    data: runsData,
    error: runsError,
    isValidating,
    mutate,
  } = useSWR(
    auth.isAuthenticated &&
      auth.walletAddress &&
      portal.portalReady &&
      portal.portalType === "brand"
      ? `/api/brands/${brandId}/workflows`
      : null,
    listFetcher,
    {
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      refreshInterval: (latest) => {
        if (detailOpen || document.visibilityState !== "visible") return 0;
        const list = Array.isArray(latest) ? latest : [];
        const pending = list.some((run) =>
          isPendingStatus(run.status ?? ""),
        );
        return pending ? 5000 : 0;
      },
    },
  );

  const openDetail = async (run: WorkflowRun) => {
    const runId = getRunId(run);
    if (!isValidRunId(runId)) return;
    router.push(`/dashboard/brand/${brandId}/workflows/${runId}`);
  };

  const refreshRuns = useCallback(
    async (showToast = false) => {
      try {
        await mutate();
        if (showToast) {
          toast.addToast("Refreshed workflow runs.", "success");
        }
      } catch (err) {
        if (showToast) {
          toast.addToast(
            err instanceof Error ? err.message : "Failed to refresh workflows",
            "error",
          );
        }
      }
    },
    [mutate, toast],
  );

  useEffect(() => {
    if (auth.isAuthenticated && auth.walletAddress) {
      if (!portal.portalReady || portal.portalType !== "brand") return;
      void load();
    }
  }, [auth.isAuthenticated, auth.walletAddress, portal.portalReady, portal.portalType, load]);

  useEffect(() => {
    if (!runsData) return;
    if (!Array.isArray(runsData)) {
      console.warn("[Workflows] run list not array", runsData);
      setError("Failed to load workflow runs.");
      return;
    }
    applyRuns(runsData);
    setError(null);
  }, [runsData, applyRuns]);

  useEffect(() => {
    if (!runsError) return;
    const msg =
      runsError instanceof Error
        ? runsError.message
        : "Failed to load workflow runs";
    setError(msg);
  }, [runsError]);

  useEffect(() => {
    if (!detailOpen || !selectedRun) {
      if (detailPollRef.current) {
        window.clearInterval(detailPollRef.current);
        detailPollRef.current = null;
      }
      return;
    }
    const runId = getRunId(selectedRun);
    const confirmed =
      (selectedRun.onchainVerification ?? "").toUpperCase() ===
      "CONFIRMED_ONCHAIN";
    if (
      !isValidRunId(runId) ||
      !isPendingStatus(selectedRun.status ?? "") ||
      confirmed ||
      isTerminalStatus(selectedRun.status ?? "")
    ) {
      if (detailPollRef.current) {
        window.clearInterval(detailPollRef.current);
        detailPollRef.current = null;
      }
      return;
    }
    if (detailPollRef.current) return;
    detailPollRef.current = window.setInterval(async () => {
      try {
        const detailData = await client.getWorkflowDetail(brandId, runId);
        setDetail(detailData);
        const confirmedOnchain =
          (detailData.onchainVerification ?? "").toUpperCase() ===
            "CONFIRMED_ONCHAIN" || detailData.onchainVerified === true;
        if (detailData.status || detailData.chainTxHash || detailData.errorMessage) {
          applyDetailToRun(runId, detailData);
        }
        if (
          confirmedOnchain ||
          (detailData.status && !isPendingStatus(detailData.status)) ||
          isTerminalStatus(detailData.status)
        ) {
          if (detailPollRef.current) {
            window.clearInterval(detailPollRef.current);
            detailPollRef.current = null;
          }
        }
      } catch (err) {
        if (isApiError(err) && err.status === 400) {
          setDetailError(err.message || "Invalid workflow run id");
        }
      }
    }, 5000);
    return () => {
      if (detailPollRef.current) {
        window.clearInterval(detailPollRef.current);
        detailPollRef.current = null;
      }
    };
  }, [brandId, detailOpen, selectedRun, isPendingStatus, isTerminalStatus, applyDetailToRun]);

  const handleVerifyNow = async () => {
    if (!selectedRun) return;
    const runId = getRunId(selectedRun);
    if (!isValidRunId(runId)) {
      toast.addToast("Select a workflow run to verify.", "error");
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    try {
      await client.verifyWorkflowRun(brandId, runId);
      const detailData = await client.getWorkflowDetail(brandId, runId);
      setDetail(detailData);
      applyDetailToRun(runId, detailData);
      toast.addToast("Verification requested", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to verify workflow";
      setVerifyError(msg);
      toast.addToast(msg, "error");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (typeof routeRunId !== "string") return;
    const normalizedRunId = routeRunId.trim();
    if (normalizedRunId === handledRunId) return;
    if (!normalizedRunId || normalizedRunId === "undefined") {
      setRouteWarning("Select a workflow run to view details.");
      setHandledRunId(normalizedRunId);
      return;
    }
    if (!isValidRunId(normalizedRunId)) {
      setRouteWarning("Invalid workflow run id.");
      setHandledRunId(normalizedRunId);
      return;
    }
    setRouteWarning(null);
    const matching = Array.isArray(runs)
      ? runs.find((run) => run && getRunId(run) === normalizedRunId)
      : undefined;
    setHandledRunId(normalizedRunId);
    void openDetailById(normalizedRunId, matching);
  }, [auth.isAuthenticated, auth.walletAddress, routeRunId, runs, openDetailById, handledRunId]);

  const handleRetry = async () => {
    if (!selectedRun) return;
    const runId = getRunId(selectedRun);
    if (!isValidRunId(runId)) {
      setDetailError("Select a workflow run to view details");
      toast.addToast("Select a workflow run to retry.", "error");
      return;
    }
    const confirmRetry = window.confirm("Retry this workflow?");
    if (!confirmRetry) return;

    setRetrying(true);
    try {
      await client.retryWorkflowRun(brandId, runId);
      toast.addToast("Retry submitted", "success");
      await load();
      const refreshedDetail = await client.getWorkflowDetail(brandId, runId);
      setDetail(refreshedDetail);
    } catch (err) {
      toast.addToast(
        err instanceof Error ? err.message : "Failed to retry workflow",
        "error",
      );
    } finally {
      setRetrying(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Workflows</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to view runs.
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Workflows
          </p>
          <h1 className="text-2xl font-bold text-white">KRNL Runs</h1>
          <p className="text-sm text-zinc-400">
            Inspect automation runs and rendered workflow payloads.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs text-zinc-400">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
              hasPending
                ? "border-green-500/40 bg-green-500/10 text-green-200"
                : "border-zinc-800 bg-zinc-900 text-zinc-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                hasPending ? "bg-green-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
            {hasPending ? "Live" : "Idle"}
          </span>
          <p className="mt-2">
            Last updated:{" "}
            {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
          </p>
          <button className="btn-secondary" onClick={() => void refreshRuns(true)}>
            Refresh
          </button>
        </div>
      </div>
      {(loading || (isValidating && runs.length === 0)) && (
        <div className="card p-4 text-sm text-zinc-400">Loading...</div>
      )}
      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      {routeWarning && (
        <div className="card border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          {routeWarning}
        </div>
      )}
      <div className="space-y-3">
        {Array.isArray(runs) && runs.length === 0 && (
          <div className="card p-4 text-sm text-zinc-400">
            No KRNL runs yet.
          </div>
        )}
        {!Array.isArray(runs) && (
          <div className="card border-red-500/40 p-4 text-sm text-red-200">
            Failed to load workflow runs.
          </div>
        )}
        {Array.isArray(runs) &&
          runs.filter(Boolean).map((run) => {
            const runId = getRunId(run);
            const validRunId = isValidRunId(runId);
            const status = statusInfo(run.status);
            const requestId = run.requestId ?? run.krnlRequestId ?? null;
            const intentId = run.intentId ?? run.krnlIntentId ?? null;
            const chainTxHash = run.chainTxHash ?? run.txHash ?? null;
            const errorMessage = run.errorMessage ?? null;
            return (
              <div key={runId || run.createdAt} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {run.type ?? "Workflow"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      Created: {run.createdAt ?? "—"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-zinc-500">Run ID</p>
                      {runId && (
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            navigator.clipboard?.writeText(runId);
                            toast.addToast("Copied run id", "success");
                          }}
                        >
                          Copy
                        </button>
                      )}
                    </div>
                    <p className="mt-2 break-all text-zinc-100">
                      {runId || "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-zinc-500">KRNL Request ID</p>
                      {requestId && (
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            navigator.clipboard?.writeText(requestId);
                            toast.addToast("Copied KRNL request id", "success");
                          }}
                        >
                          Copy
                        </button>
                      )}
                    </div>
                    <p className="mt-2 break-all text-zinc-100">
                      {requestId ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-zinc-500">KRNL Intent ID</p>
                      {intentId && (
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            navigator.clipboard?.writeText(intentId);
                            toast.addToast("Copied KRNL intent id", "success");
                          }}
                        >
                          Copy
                        </button>
                      )}
                    </div>
                    <p className="mt-2 break-all text-zinc-100">
                      {intentId ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-300">
                  <div>
                    <p className="text-zinc-500">Onchain Tx</p>
                    {chainTxHash ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${chainTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-red-300 hover:text-red-200"
                      >
                        {chainTxHash.slice(0, 10)}...
                      </a>
                    ) : (
                      <p className="mt-1 text-zinc-400">—</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary"
                      onClick={() => void openDetail(run)}
                      disabled={!validRunId}
                    >
                      View Details
                    </button>
                    {!validRunId && (
                      <span className="text-xs text-red-300">Missing run id</span>
                    )}
                  </div>
                </div>

                {run.status?.toLowerCase() === "failed" && errorMessage && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 break-words overflow-x-auto max-h-48">
                    {errorMessage}
                  </div>
                )}

                {run.krnlStatusJson && (
                  <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
                      Details
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap break-words">
                      {JSON.stringify(run.krnlStatusJson, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
      </div>
      <Modal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          router.push(`/dashboard/brand/${brandId}/workflows`);
        }}
        title="Workflow Run"
        side="right"
      >
        {detailError ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
            {detailError}
          </div>
        ) : detail ? (
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-sm text-zinc-300">
              {(() => {
                const meta = detail.metadata as
                  | { scope?: string; executionScope?: string; runScope?: string }
                  | undefined;
                const scopeRaw =
                  meta?.scope ?? meta?.executionScope ?? meta?.runScope ?? "";
                const scope =
                  typeof scopeRaw === "string"
                    ? scopeRaw.toUpperCase()
                    : "";
                const isPlatform =
                  scope === "PLATFORM" ||
                  (selectedRun?.type ?? "").toUpperCase().includes("PLATFORM");
                return (
                  <>
                    <div>
                      <p className="text-xs uppercase text-zinc-500">Run ID</p>
                      <p className="font-mono text-zinc-100">{detail.runId}</p>
                    </div>
                    {isPlatform && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                        Scope: Platform
                      </span>
                    )}
                  </>
                );
              })()}
              <button
                className="btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(detail.runId);
                  toast.addToast("Copied run id", "success");
                }}
              >
                Copy
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-zinc-500">KRNL Request ID</p>
                  {(detail.requestId ??
                    selectedRun?.requestId ??
                    detail.krnlRequestId ??
                    selectedRun?.krnlRequestId) && (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        const id =
                          detail.requestId ??
                          selectedRun?.requestId ??
                          detail.krnlRequestId ??
                          selectedRun?.krnlRequestId ??
                          "";
                        navigator.clipboard?.writeText(id);
                        toast.addToast("Copied KRNL request id", "success");
                      }}
                    >
                      Copy
                    </button>
                  )}
                </div>
                <p className="mt-2 break-all text-zinc-100">
                  {detail.requestId ??
                    selectedRun?.requestId ??
                    detail.krnlRequestId ??
                    selectedRun?.krnlRequestId ??
                    "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-zinc-500">KRNL Intent ID</p>
                  {(detail.intentId ??
                    selectedRun?.intentId ??
                    detail.krnlIntentId ??
                    selectedRun?.krnlIntentId) && (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        const id =
                          detail.intentId ??
                          selectedRun?.intentId ??
                          detail.krnlIntentId ??
                          selectedRun?.krnlIntentId ??
                          "";
                        navigator.clipboard?.writeText(id);
                        toast.addToast("Copied KRNL intent id", "success");
                      }}
                    >
                      Copy
                    </button>
                  )}
                </div>
                <p className="mt-2 break-all text-zinc-100">
                  {detail.intentId ??
                    selectedRun?.intentId ??
                    detail.krnlIntentId ??
                    selectedRun?.krnlIntentId ??
                    "—"}
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                <p className="text-zinc-500">KRNL Status</p>
                <p className="mt-2 text-zinc-100">
                  {detail.krnlStatus ??
                    selectedRun?.krnlStatus ??
                    detail.status ??
                    selectedRun?.status ??
                    "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                <p className="text-zinc-500">Onchain Verification</p>
                <p className="mt-2 text-zinc-100">
                  {(detail.onchainVerification ??
                    selectedRun?.onchainVerification ??
                    (detail.onchainVerified ? "CONFIRMED_ONCHAIN" : undefined)) ===
                  "CONFIRMED_ONCHAIN"
                    ? "CONFIRMED"
                    : "NOT CONFIRMED"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                <p className="text-zinc-500">Onchain Tx</p>
                <p className="mt-2 break-all text-zinc-100">
                  {detail.chainTxHash ??
                    detail.txHash ??
                    selectedRun?.chainTxHash ??
                    selectedRun?.txHash ??
                    "—"}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
              <p className="text-zinc-500">Onchain Metadata Base URI</p>
              <p className="mt-2 break-all text-zinc-100">
                {detail.onchainMetadataBaseURI ??
                  detail.metadataBaseURI ??
                  (detail.metadata as { metadataBaseURI?: string })?.metadataBaseURI ??
                  (detail.metadata as { metadataBaseUri?: string })?.metadataBaseUri ??
                  "—"}
              </p>
            </div>
            {detail.errorMessage && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 break-words">
                {detail.errorMessage}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn-secondary"
                onClick={handleVerifyNow}
                disabled={verifying}
              >
                {verifying ? "Verifying..." : "Verify now"}
              </button>
              {verifyError && (
                <span className="text-xs text-red-300">{verifyError}</span>
              )}
            </div>
            {invalidHint && (
              <div className="rounded-xl border border-red-500/40 bg-red-600/10 px-3 py-2 text-sm text-red-200">
                {invalidHint}
              </div>
            )}
            {(() => {
              const steps =
                (detail as { steps?: unknown }).steps ??
                (detail.renderedWorkflowJson as { steps?: unknown } | undefined)
                  ?.steps ??
                (detail.metadata as { steps?: unknown } | undefined)?.steps ??
                null;
              if (!steps) return null;
              return (
                <div className="overflow-auto">
                  <p className="text-sm font-semibold text-zinc-200">Steps</p>
                  <JsonViewer data={steps} />
                </div>
              );
            })()}
            {selectedRun?.status === "failed" && (
              <button
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-800"
                onClick={handleRetry}
                disabled={retrying}
              >
                {retrying ? "Retrying..." : "Retry"}
              </button>
            )}
            {detail.metadata && (
              <div className="overflow-auto">
                <p className="text-sm font-semibold text-zinc-200">Metadata</p>
                <JsonViewer data={detail.metadata} />
              </div>
            )}
            {(() => {
              const payload =
                (detail as { payload?: unknown }).payload ??
                (detail as { requestPayload?: unknown }).requestPayload ??
                (detail as { workflowPayload?: unknown }).workflowPayload ??
                null;
              if (!payload) return null;
              return (
                <div className="overflow-auto">
                  <p className="text-sm font-semibold text-zinc-200">Payload</p>
                  <JsonViewer data={payload} />
                </div>
              );
            })()}
            {detail.renderedWorkflowJson && (
              <div className="overflow-auto">
                <p className="text-sm font-semibold text-zinc-200">
                  Rendered Workflow
                </p>
                <JsonViewer data={detail.renderedWorkflowJson} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Loading run...</p>
        )}
      </Modal>
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
