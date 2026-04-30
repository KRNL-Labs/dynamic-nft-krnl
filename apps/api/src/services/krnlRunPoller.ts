import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { prisma } from "../db";
import { resolveKrnlTrackingStatus } from "./krnlService";

const DEFAULT_DEV_INTERVAL_MS = 5000;
const DEFAULT_PROD_INTERVAL_MS = 15000;
const RUN_TIMEOUT_MS = 20 * 60 * 1000;
const DEMO_MODE = String(process.env.DEMO_MODE || "").toLowerCase() === "true";

const getIntervalMs = () => {
  const fromEnv = process.env.KRNL_POLL_INTERVAL_MS;
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return process.env.NODE_ENV === "production" ? DEFAULT_PROD_INTERVAL_MS : DEFAULT_DEV_INTERVAL_MS;
};

const getRpcUrl = () => process.env.RPC_SEPOLIA_URL || process.env.SEPOLIA_RPC_URL || null;

const getPublicClient = () => {
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) return null;
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
};


const mapKrnlStatus = (status: "queued" | "running" | "succeeded" | "failed") => status;

const extractStepError = (raw: Record<string, any> | null | undefined): string | undefined => {
  if (!raw) return undefined;
  const steps = raw.steps || raw.result?.steps || raw.data?.steps;
  if (!Array.isArray(steps)) return undefined;
  for (const step of steps) {
    const err =
      step?.error ||
      step?.err ||
      step?.result?.error ||
      step?.result?.err ||
      step?.message;
    if (typeof err === "string" && err.trim()) {
      return err.trim();
    }
  }
  return undefined;
};

const buildErrorMessage = (raw: Record<string, any> | null | undefined, fallback: string) => {
  if (!raw) return fallback;
  const stepError = extractStepError(raw);
  if (stepError) {
    return stepError.length > 1000 ? `${stepError.slice(0, 1000)}...` : stepError;
  }
  const errValue = raw.err ?? raw.result?.err ?? raw.error ?? raw.result?.error;
  let message: string | undefined;
  if (typeof errValue === "string" && errValue.trim()) {
    message = errValue.trim();
  } else if (typeof raw.result === "string" && raw.result.trim()) {
    message = raw.result.trim();
  } else if (raw.result) {
    try {
      message = JSON.stringify(raw.result);
    } catch {
      message = String(raw.result);
    }
  }
  const finalMessage = message ?? fallback;
  const combined = `${finalMessage} ${JSON.stringify(raw ?? {})}`;
  if (combined.includes("AA20 account not deployed")) {
    return "Platform executor account not deployed. Bootstrap required.";
  }
  return finalMessage.length > 1000 ? `${finalMessage.slice(0, 1000)}...` : finalMessage;
};

const looksLikeTxHash = (value: unknown) =>
  typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);

const extractTxHash = (raw: Record<string, any> | null | undefined): string | undefined => {
  if (!raw) return undefined;

  const directCandidates = [
    raw.txHash,
    raw.transactionHash,
    raw.result?.txHash,
    raw.result?.transactionHash,
    raw.receipt?.transactionHash,
    raw.execution?.txHash,
    raw.run?.txHash
  ];
  for (const candidate of directCandidates) {
    if (looksLikeTxHash(candidate)) return candidate;
  }

  const steps = raw.steps || raw.result?.steps || raw.data?.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const stepCandidates = [
        step?.txHash,
        step?.transactionHash,
        step?.receipt?.transactionHash
      ];
      for (const candidate of stepCandidates) {
        if (looksLikeTxHash(candidate)) return candidate;
      }
    }
  }

  return undefined;
};

const extractSteps = (raw: Record<string, any> | null | undefined) => {
  if (!raw) return undefined;
  const steps = raw.steps || raw.result?.steps || raw.data?.steps;
  return Array.isArray(steps) ? steps : undefined;
};

const normalizeTraitValue = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const extractUnlockedTraits = (raw: Record<string, any> | null | undefined, steps?: any[]) => {
  const candidates: Array<{ traitKey: string; traitValue: string }> = [];
  const sources: any[] = [];
  if (raw) sources.push(raw);
  if (steps) sources.push(...steps);

  for (const source of sources) {
    const payload = source?.result ?? source?.output ?? source?.data ?? source;
    const traitPairs = payload?.traits || payload?.unlockedTraits || payload?.traitUpdates;
    if (Array.isArray(traitPairs)) {
      for (const trait of traitPairs) {
        const key = trait?.key ?? trait?.traitKey;
        const value = trait?.value ?? trait?.traitValue;
        if (key != null && value != null) {
          candidates.push({
            traitKey: normalizeTraitValue(key),
            traitValue: normalizeTraitValue(value)
          });
        }
      }
    }

    const keys = payload?.traitKeys || payload?.trait_keys;
    const values = payload?.traitValues || payload?.trait_values;
    if (Array.isArray(keys) && Array.isArray(values) && keys.length === values.length) {
      for (let i = 0; i < keys.length; i += 1) {
        candidates.push({
          traitKey: normalizeTraitValue(keys[i]),
          traitValue: normalizeTraitValue(values[i])
        });
      }
    }
  }

  const seen = new Set<string>();
  const unique = [];
  for (const trait of candidates) {
    if (!trait.traitKey || !trait.traitValue) continue;
    const key = `${trait.traitKey}::${trait.traitValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trait);
  }
  return unique;
};

const getTxStatus = async (txHash: string) => {
  const client = getPublicClient();
  if (!client) return null;
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    return receipt.status === "success" ? "success" : "reverted";
  } catch {
    return null;
  }
};

let pollerRunning = false;

const pollOnce = async () => {
  if (pollerRunning) return;
  pollerRunning = true;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const runs = await prisma.workflowRun.findMany({
      where: {
        createdAt: { gte: since },
        AND: [
          {
            status: {
              in: ["queued", "running"]
            }
          }
        ]
      },
      orderBy: { createdAt: "desc" }
    });

    for (const run of runs) {
      const txIntentId = run.txIntentId ?? null;
      const krnlIntentId = run.intentId ?? null;
      const requestId = run.requestId ?? null;
      if (!txIntentId && !requestId && !krnlIntentId) continue;
      const ageMs = Date.now() - run.createdAt.getTime();

      let statusResponse:
        | {
            status: "queued" | "running" | "succeeded" | "failed" | "unknown";
            txHash?: string;
            error?: string;
            raw?: Record<string, any> | null;
          }
        | null = null;
      try {
        statusResponse = await resolveKrnlTrackingStatus({
          requestId,
          krnlIntentId,
          txIntentId
        });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[krnl-poller] status fetch failed requestId=${requestId ?? ""} txIntentId=${txIntentId ?? ""}`,
            err
          );
        }
        continue;
      }

      if (process.env.NODE_ENV !== "production" && statusResponse) {
        console.log(
          `[krnl-poller] poll requestId=${requestId ?? ""} txIntentId=${txIntentId ?? ""} status=${statusResponse.status}${krnlIntentId ? ` krnlIntentId=${krnlIntentId}` : ""}`
        );
      }

      let mappedStatus = run.status;
      if (statusResponse) {
        if (statusResponse.status === "unknown") {
          mappedStatus = run.status;
        } else {
          mappedStatus = mapKrnlStatus(statusResponse.status);
        }
      }

      const raw = statusResponse?.raw ?? null;
      const nextKrnlExecutionHash =
        run.krnlExecutionHash || statusResponse?.txHash || extractTxHash(raw ?? null);
      const nextSteps = extractSteps(raw ?? null);

      let nextChainTxHash = run.chainTxHash ?? null;
      let txStatus: string | null = null;
      if (!nextChainTxHash && nextKrnlExecutionHash) {
        const receiptStatus = await getTxStatus(nextKrnlExecutionHash);
        if (receiptStatus) {
          nextChainTxHash = nextKrnlExecutionHash;
          txStatus = receiptStatus;
        }
      }

      if (ageMs > RUN_TIMEOUT_MS) {
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            error: "Workflow timed out",
            completedAt: new Date()
          }
        });
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[krnl-poller] timeout run=${run.id} txIntentId=${txIntentId ?? ""} requestId=${requestId ?? ""} ageMs=${ageMs}`
          );
        }
        continue;
      }

      if (!statusResponse) {
        continue;
      }

      const nextError =
        mappedStatus === "failed"
          ? buildErrorMessage(raw ?? null, statusResponse.error ?? "KRNL run failed")
          : run.error;
      const nextStatusJson = raw ?? null;
      const statusJsonChanged = JSON.stringify(run.krnlStatusJson ?? null) !== JSON.stringify(nextStatusJson);
      const statusChanged = run.status !== mappedStatus;
      const executionHashChanged = !!nextKrnlExecutionHash && !run.krnlExecutionHash;
      const chainHashChanged = !!nextChainTxHash && !run.chainTxHash;
      const errorChanged =
        mappedStatus === "failed" && (run.error ?? "") !== (nextError ?? "");
      const stepsChanged = JSON.stringify(run.stepsJson ?? null) !== JSON.stringify(nextSteps ?? null);

      if (
        statusChanged ||
        executionHashChanged ||
        chainHashChanged ||
        errorChanged ||
        statusJsonChanged ||
        stepsChanged
      ) {
        const updateData: Record<string, any> = {
          status: mappedStatus,
          krnlStatusJson: nextStatusJson ?? undefined,
          stepsJson: nextSteps ?? undefined
        };

        if (executionHashChanged) {
          updateData.krnlExecutionHash = nextKrnlExecutionHash;
          if (!run.txHash && nextKrnlExecutionHash) {
            updateData.txHash = nextKrnlExecutionHash;
          }
        }

        if (chainHashChanged && nextChainTxHash) {
          updateData.chainTxHash = nextChainTxHash;
          updateData.txHash = nextChainTxHash;
        }

        if (mappedStatus === "failed") {
          updateData.completedAt = new Date();
        }

        if (mappedStatus === "failed") {
          updateData.error = nextError;
        }

        if (mappedStatus === "succeeded") {
          updateData.completedAt = new Date();
        }

        if (mappedStatus === "succeeded" && txStatus) {
          const enriched = {
            ...(nextStatusJson ?? {}),
            txStatus
          };
          updateData.krnlStatusJson = enriched;
        }
        if (mappedStatus === "succeeded" && run.status !== "succeeded" && run.type === "OPEN_LOOTBOX") {
          await prisma.$transaction(async (tx) => {
            const tokenId = run.tokenId ?? null;
            const unlockedTraits = extractUnlockedTraits(raw ?? null, nextSteps);
            if (unlockedTraits.length > 0) {
              await tx.unlockedTrait.createMany({
                data: unlockedTraits.map((trait) => ({
                  brandId: run.brandId,
                  wallet: run.wallet,
                  tokenId,
                  traitKey: trait.traitKey,
                  traitValue: trait.traitValue,
                  sourceRunId: run.id,
                  unlockedAt: new Date()
                })),
                skipDuplicates: true
              });
            }

            await tx.workflowRun.update({
              where: { id: run.id },
              data: updateData
            });
          });
        } else if (mappedStatus === "succeeded" && run.status !== "succeeded" && run.type === "SET_ACTIVE_TRAITS") {
          await prisma.$transaction(async (tx) => {
            const metadata = (run.renderedWorkflowJson as any)?.metadata;
            const selectedTraits = Array.isArray(metadata?.selectedTraits)
              ? metadata.selectedTraits
              : [];
            for (const trait of selectedTraits) {
              const traitKey = normalizeTraitValue(trait?.traitKey ?? trait?.key);
              const traitValue = normalizeTraitValue(trait?.traitValue ?? trait?.value);
              if (!traitKey || !traitValue) continue;
              await tx.unlockedTrait.updateMany({
                where: {
                  brandId: run.brandId,
                  wallet: run.wallet,
                  traitKey,
                  isActive: true,
                  NOT: { traitValue }
                },
                data: { isActive: false, activeAt: null }
              });
              await tx.unlockedTrait.updateMany({
                where: {
                  brandId: run.brandId,
                  wallet: run.wallet,
                  traitKey,
                  traitValue
                },
                data: { isActive: true, activeAt: new Date() }
              });
            }
            await tx.workflowRun.update({
              where: { id: run.id },
              data: updateData
            });
          });
        } else {
          await prisma.workflowRun.update({
            where: { id: run.id },
            data: updateData
          });
        }

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[krnl-poller] run ${run.id} txIntentId=${txIntentId ?? ""} requestId=${requestId ?? ""} status=${mappedStatus} txHash=${updateData.txHash ?? ""}`
          );
        }
      }

      if (
        mappedStatus === "failed" &&
        (statusChanged || errorChanged) &&
        raw &&
        process.env.NODE_ENV !== "production"
      ) {
        console.error(
          `[krnl-poller] failure payload txIntentId=${txIntentId ?? ""} requestId=${requestId ?? ""}`,
          raw
        );
      }
    }
  } finally {
    pollerRunning = false;
  }
};

export const startKrnlRunPoller = () => {
  if (DEMO_MODE) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[krnl-poller] demo mode enabled; poller disabled");
    }
    return;
  }
  const interval = getIntervalMs();
  if (!interval || interval <= 0) return;
  if (process.env.NODE_ENV !== "production") {
    console.log(`[krnl-poller] starting with interval ${interval}ms`);
  }
  setInterval(() => {
    void pollOnce();
  }, interval);
};
