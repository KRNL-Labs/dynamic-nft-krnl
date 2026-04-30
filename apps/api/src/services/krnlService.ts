import { Prisma, WorkflowRunType } from "@prisma/client";
import { randomBytes, randomUUID } from "crypto";
import { prisma } from "../db";
import { getZealyConfigForBrand } from "./zealyService";
import {
  getRunStatus as getRunStatusFromNode,
  getRunStatusHttp as getRunStatusHttpFromNode,
  submitWorkflow as submitWorkflowToNode
} from "./krnlNodeClient";
import { WorkflowType, renderWorkflowTemplate } from "./workflowTemplateService";
import { ensureExecutorBootstrapped } from "./krnlBootstrapService";
import { signKrnlIntent } from "./krnlIntentSigner";
import { encodeLootboxAuthData } from "./authDataEncoder";
import {
  normalizeKrnlReturnedIntentId,
  resolveCanonicalWorkflowIntentId
} from "./krnlIntentIdResolver";

const KRNL_DEFAULT_CHAIN_ID = process.env.KRNL_DEFAULT_CHAIN_ID
  ? parseInt(process.env.KRNL_DEFAULT_CHAIN_ID, 10)
  : undefined;
const DEMO_MODE = String(process.env.DEMO_MODE || "").toLowerCase() === "true";
const KRNL_DEFAULT_RPC_URL = process.env.KRNL_DEFAULT_RPC_URL;
const KRNL_ATTESTOR_URL =
  process.env.KRNL_ATTESTOR_URL || process.env.KRNL_ATTESTOR_IMAGE;
const KRNL_BUNDLER_URL = process.env.KRNL_BUNDLER_URL;
const KRNL_PAYMASTER_URL = process.env.KRNL_PAYMASTER_URL;
const KRNL_GAS_LIMIT = process.env.KRNL_GAS_LIMIT;
const KRNL_MAX_FEE_PER_GAS = process.env.KRNL_MAX_FEE_PER_GAS;
const KRNL_MAX_PRIORITY_FEE_PER_GAS = process.env.KRNL_MAX_PRIORITY_FEE_PER_GAS;

const parseRequiredNumber = (value: string | undefined, name: string): number => {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is not a valid number`);
  }
  return parsed;
};

const injectPimlicoKey = (url: string | undefined, name: string): string => {
  if (!url) {
    throw new Error(`${name} is not configured`);
  }

  let resolved = url;
  if (process.env.PIMLICO_API_KEY) {
    resolved = resolved.replace(
      /\$\{PIMLICO_API_KEY\}|\{PIMLICO_API_KEY\}|PIMLICO_API_KEY/g,
      process.env.PIMLICO_API_KEY
    );
  }

  try {
    const parsed = new URL(resolved);
    if (process.env.PIMLICO_API_KEY) {
      parsed.searchParams.delete("apikey");
      parsed.searchParams.set("apikey", process.env.PIMLICO_API_KEY);
    }
    const apiKey = parsed.searchParams.get("apikey");
    if (!apiKey) {
      throw new Error(`${name} is missing PIMLICO_API_KEY`);
    }
    return parsed.toString();
  } catch {
    const hasApiKey = /apikey=([^&]+)/i.test(resolved);
    if (!hasApiKey && process.env.PIMLICO_API_KEY) {
      const joiner = resolved.includes("?") ? "&" : "?";
      resolved = `${resolved}${joiner}apikey=${process.env.PIMLICO_API_KEY}`;
    }
    const cleaned = resolved.replace(/([?&])apikey=&?/gi, "$1").replace(/[?&]$/, "");
    const finalMatch = cleaned.match(/apikey=([^&]+)/i);
    if (!finalMatch || !finalMatch[1]) {
      throw new Error(`${name} is missing PIMLICO_API_KEY`);
    }
    return cleaned;
  }
};

type WorkflowSubmission = {
  workflowRunId: string;
  status: "queued";
  requestId?: string;
  intentId?: string | null;
  txIntentId?: string | null;
  krnlIntentId?: string | null;
};

interface MintWorkflowInput {
  brandId: string;
  walletAddress: string;
  workflowRunType?: WorkflowRunType;
  transactionIntentDelegate?: string;
  transactionIntentId?: string;
  transactionIntentDeadline?: number;
  userSignature?: string;
  actionQueueItemId?: string;
}

interface QuestRewardWorkflowInput {
  brandId: string;
  walletAddress: string;
  zealyQuestId?: string;
  questId?: string;
  tokenId?: string;
  authResultHex: string;
  authSignatureHex: string;
  transactionIntentDelegate?: string;
  transactionIntentId?: string;
  transactionIntentDeadline?: number;
  userSignature?: string;
  actionQueueItemId?: string;
}

interface LootboxWorkflowInput {
  brandId: string;
  walletAddress: string;
  tokenId: string;
  authResultHex: string;
  authSignatureHex: string;
  workflowRunType?: WorkflowRunType;
  transactionIntentDelegate?: string;
  transactionIntentId?: string;
  transactionIntentDeadline?: number;
  userSignature?: string;
  actionQueueItemId?: string;
}

interface SetActiveTraitsWorkflowInput {
  brandId: string;
  walletAddress: string;
  tokenId: string;
  traitSelections: Array<{ traitKey: string; traitValue: string }>;
  actionQueueItemId?: string;
}

const getBrandAndConfig = async (brandId: string) => {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) {
    throw new Error("Brand not found");
  }
  const nftConfig = await prisma.brandNftConfig.findUnique({ where: { brandId } });
  return { brand, nftConfig };
};

const mapWorkflowTypeToRunType = (type: WorkflowType): WorkflowRunType => {
  switch (type) {
    case "mint":
      return "MINT_BASE_NFT";
    case "quest_reward":
      return "QUEST_REWARD";
    case "lootbox":
      return "OPEN_LOOTBOX";
    case "set_active_traits":
      return "SET_ACTIVE_TRAITS";
    default:
      return "QUEST_REWARD";
  }
};

const mapWorkflowTypeToDemoAction = (type: WorkflowType): string => {
  switch (type) {
    case "mint":
      return "mint-base-nft";
    case "lootbox":
      return "open-lootbox";
    case "set_active_traits":
      return "set-active-traits";
    case "quest_reward":
      return "apply-quest-result";
    default:
      return type;
  }
};

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

const buildKrnlErrorMessage = (
  raw: Record<string, any> | null | undefined,
  fallback: string
): string => {
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
  const combined = `${finalMessage} ${JSON.stringify(raw)}`;
  if (combined.includes("AA20 account not deployed")) {
    return "Platform executor account not deployed. Bootstrap required.";
  }
  return finalMessage.length > 1000 ? `${finalMessage.slice(0, 1000)}...` : finalMessage;
};

const summarizeSystemExecutorDeclaration = (workflowJson: unknown): string => {
  if (!workflowJson || typeof workflowJson !== "object" || Array.isArray(workflowJson)) {
    return "none";
  }
  const payload = workflowJson as Record<string, any>;
  const candidates = [
    payload.systemExecutors,
    payload.system_executors,
    payload.systemExecutor,
    payload.system_executor,
    payload.workflow?.systemExecutors,
    payload.workflow?.system_executors,
    payload.workflow?.systemExecutor,
    payload.workflow?.system_executor
  ];
  const value = candidates.find((entry) => entry !== undefined);
  if (value === undefined || value === null) return "none";
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (typeof value === "object") {
    return `object(keys=${Object.keys(value as Record<string, unknown>).join(",")})`;
  }
  return typeof value;
};

const baseVariables = async (
  brand: {
    primaryChainId: number;
  },
  walletAddress: string,
  nftConfig?: { chainId: number; rpcUrl: string; contractAddress: string } | null,
  overrides?: {
    transactionIntentDelegate?: string;
    transactionIntentId?: string;
    transactionIntentDeadline?: number;
    userSignature?: string;
  }
): Promise<Record<string, string | number | boolean>> => {
  if (!KRNL_ATTESTOR_URL) {
    throw new Error(
      "Missing KRNL_ATTESTOR_URL (set KRNL_ATTESTOR_URL or KRNL_ATTESTOR_IMAGE in .env)"
    );
  }
  const senderAddress = process.env.KRNL_SENDER_ADDRESS;
  if (!senderAddress) {
    throw new Error("Missing KRNL_SENDER_ADDRESS (set KRNL_SENDER_ADDRESS in .env)");
  }
  const bundlerUrl = injectPimlicoKey(KRNL_BUNDLER_URL, "KRNL_BUNDLER_URL");
  const paymasterUrl = injectPimlicoKey(KRNL_PAYMASTER_URL, "KRNL_PAYMASTER_URL");
  const gasLimit = parseRequiredNumber(KRNL_GAS_LIMIT, "KRNL_GAS_LIMIT");
  const maxFeePerGas = parseRequiredNumber(KRNL_MAX_FEE_PER_GAS, "KRNL_MAX_FEE_PER_GAS");
  const maxPriorityFeePerGas = parseRequiredNumber(
    KRNL_MAX_PRIORITY_FEE_PER_GAS,
    "KRNL_MAX_PRIORITY_FEE_PER_GAS"
  );
  let transactionIntentId =
    overrides?.transactionIntentId || `0x${randomBytes(32).toString("hex")}`;
  let transactionIntentDeadline =
    overrides?.transactionIntentDeadline ?? Math.floor(Date.now() / 1000) + 600;
  const transactionIntentDelegate =
    overrides?.transactionIntentDelegate ||
    process.env.TRANSACTION_INTENT_DELEGATE ||
    process.env.KRNL_DELEGATE_ADDRESS ||
    senderAddress;
  let userSignature = overrides?.userSignature ?? "0x";

  if (!userSignature || userSignature === "0x") {
    const chainId = nftConfig?.chainId ?? brand.primaryChainId ?? KRNL_DEFAULT_CHAIN_ID;
    if (!chainId) {
      throw new Error("KRNL_DEFAULT_CHAIN_ID is not configured");
    }
    const verifyingContract =
      process.env.KRNL_DELEGATED_ACCOUNT_ADDRESS ||
      process.env.NEXT_PUBLIC_DELEGATED_ACCOUNT_ADDRESS ||
      senderAddress;
    const signed = await signKrnlIntent({
      sender: senderAddress,
      delegate: transactionIntentDelegate,
      chainId,
      verifyingContract,
      intentId: transactionIntentId,
      deadline: transactionIntentDeadline
    });
    transactionIntentId = signed.intentId;
    transactionIntentDeadline = signed.deadline;
    userSignature = signed.signature;
  }

  const contractAddress = nftConfig?.contractAddress;
  if (!contractAddress) {
    throw new Error("Missing ENV.TARGET_CONTRACT (brand has no contract configured)");
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[intent] id=${transactionIntentId} deadline=${transactionIntentDeadline} sigLen=${userSignature.length} sender=${senderAddress} delegate=${transactionIntentDelegate} attestor=${KRNL_ATTESTOR_URL} bundler=${bundlerUrl} paymaster=${paymasterUrl}`
    );
  }
  console.log(
    `[workflow] sender=${senderAddress} delegate=${transactionIntentDelegate} target=${contractAddress}`
  );

  return {
    CHAIN_ID: nftConfig?.chainId ?? brand.primaryChainId ?? KRNL_DEFAULT_CHAIN_ID ?? 0,
    RPC_URL: nftConfig?.rpcUrl ?? KRNL_DEFAULT_RPC_URL ?? "",
    NFT_CONTRACT: contractAddress,
    "ENV.TARGET_CONTRACT": contractAddress,
    WALLET_ADDRESS: walletAddress,
    MINT_TO: walletAddress,
    "ENV.SENDER_ADDRESS": senderAddress,
    "ENV.ATTESTOR_IMAGE": KRNL_ATTESTOR_URL,
    TRANSACTION_INTENT_DELEGATE: transactionIntentDelegate,
    TRANSACTION_INTENT_ID: transactionIntentId,
    TRANSACTION_INTENT_DEADLINE: transactionIntentDeadline,
    USER_SIGNATURE: userSignature,
    BUNDLER_URL: bundlerUrl,
    PAYMASTER_URL: paymasterUrl,
    GAS_LIMIT: gasLimit,
    MAX_FEE_PER_GAS: maxFeePerGas,
    MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas,
    SPONSOR_EXECUTION_FEE: 0,
    TRANSACTION_INTENT_SIGNATURE: userSignature,
    DELEGATION_SIGNATURE: ""
  };
};

const stripSubmitMetadata = (workflowJson: unknown) => {
  if (!workflowJson || typeof workflowJson !== "object" || Array.isArray(workflowJson)) {
    return workflowJson;
  }
  const record = workflowJson as Record<string, any>;
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object") {
    return workflowJson;
  }
  if (!("krnlSubmitMethod" in (metadata as Record<string, any>))) {
    return workflowJson;
  }
  return {
    ...record,
    metadata: Object.fromEntries(
      Object.entries(metadata as Record<string, any>).filter(([key]) => key !== "krnlSubmitMethod")
    )
  };
};

const attachSubmitMetadata = (workflowJson: unknown, submitMethod: string) => {
  if (!workflowJson || typeof workflowJson !== "object" || Array.isArray(workflowJson)) {
    return workflowJson;
  }
  const record = workflowJson as Record<string, any>;
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return {
    ...record,
    metadata: {
      ...(metadata as Record<string, any>),
      krnlSubmitMethod: submitMethod
    }
  };
};


export const submitWorkflowToKrnl = async (
  renderedWorkflowJson: unknown
): Promise<{
  requestId: string;
  txIntentId?: string | null;
  krnlIntentId?: string | null;
  krnlMethod: string;
}> => {
  const sanitized = stripSubmitMetadata(renderedWorkflowJson);
  const txIntentIdFromPayload = resolveCanonicalWorkflowIntentId({
    workflowJson: sanitized
  });
  if (DEMO_MODE) {
    const requestId = randomUUID();
    console.log(
      `[krnl] demo submit requestId=${requestId} txIntentId=${txIntentIdFromPayload ?? ""}`
    );
    return {
      requestId,
      txIntentId: txIntentIdFromPayload ?? null,
      krnlIntentId: null,
      krnlMethod: "demo"
    };
  }
  await ensureExecutorBootstrapped();
  let attempt = 0;
  while (attempt < 2) {
    try {
      const { requestId, krnlIntentId, krnlMethod } = await submitWorkflowToNode({
        workflowJson: sanitized
      });
      const normalizedKrnlIntentId = normalizeKrnlReturnedIntentId(krnlIntentId);
      const txIntentId = txIntentIdFromPayload ?? normalizedKrnlIntentId;
      const submitLogSuffix = normalizedKrnlIntentId
        ? ` krnlIntentId=${normalizedKrnlIntentId}`
        : "";
      console.log(`[krnl] submit ids requestId=${requestId ?? ""} txIntentId=${txIntentId ?? ""}${submitLogSuffix}`);
      if (!txIntentId) {
        console.warn(
          `[krnl] failed to resolve tx intent id from payload for requestId=${requestId}`
        );
      }
      return { requestId, txIntentId, krnlIntentId: normalizedKrnlIntentId, krnlMethod };
    } catch (error) {
      const raw = (error as any)?.krnlRaw;
      const message = error instanceof Error ? error.message : String(error);
      const combined = `${message} ${raw ? JSON.stringify(raw) : ""}`;
      if (combined.includes("AA20 account not deployed") && attempt === 0) {
        await ensureExecutorBootstrapped();
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
  throw new Error("KRNL submission failed");
};

export const getKrnlRunStatus = async (
  krnlStatusRef: string
): Promise<{
  status: "queued" | "running" | "succeeded" | "failed";
  txHash?: string;
  error?: string;
  raw?: Record<string, any> | null;
}> => {
  const statusResponse = await getRunStatusFromNode({ requestId: krnlStatusRef });
  let status: "queued" | "running" | "succeeded" | "failed" = "queued";
  if (statusResponse.status === "PENDING") status = "queued";
  else if (statusResponse.status === "PROCESSING") status = "running";
  else if (statusResponse.status === "SUCCESS") status = "succeeded";
  else if (statusResponse.status === "FAILED") status = "failed";

  const raw = statusResponse.raw as Record<string, any> | null;
  const error =
    (raw?.error as string | undefined) ||
    (raw?.errorMessage as string | undefined) ||
    (raw?.err as string | undefined) ||
    (raw?.result?.error as string | undefined) ||
    (raw?.result?.errorMessage as string | undefined) ||
    (raw?.result?.err as string | undefined) ||
    (raw?.data?.error as string | undefined) ||
    (raw?.data?.errorMessage as string | undefined);

  return { status, txHash: statusResponse.txHash, error, raw };
};

export const getKrnlRunStatusHttp = async (
  requestId: string
): Promise<{
  status: "queued" | "running" | "succeeded" | "failed" | "unknown";
  txHash?: string;
  error?: string;
  raw?: Record<string, any> | null;
}> => {
  const statusResponse = await getRunStatusHttpFromNode({ requestId });
  let status: "queued" | "running" | "succeeded" | "failed" | "unknown" = "unknown";
  const raw = statusResponse.raw as Record<string, any> | null;
  const rawCode = raw?.code;
  if (typeof rawCode === "number") {
    if (rawCode === 0) status = "queued";
    else if (rawCode === 1) status = "running";
    else if (rawCode === 2) status = "succeeded";
    else if (rawCode === 3) status = "failed";
  }
  const rawStatus = typeof statusResponse.status === "string" ? statusResponse.status : "";
  const value = rawStatus.toLowerCase();
  if (status === "unknown") {
    if (value.includes("pending") || value.includes("queued")) status = "queued";
    else if (value.includes("running") || value.includes("processing")) status = "running";
    else if (value.includes("success") || value.includes("complete")) status = "succeeded";
    else if (value.includes("failed") || value.includes("error")) status = "failed";
  }

  const error =
    (raw?.error as string | undefined) ||
    (raw?.errorMessage as string | undefined) ||
    (raw?.err as string | undefined) ||
    (raw?.result?.error as string | undefined) ||
    (raw?.result?.errorMessage as string | undefined) ||
    (raw?.result?.err as string | undefined);

  return { status, txHash: statusResponse.txHash, error, raw };
};

const isWrongKrnlRpcId = (status: {
  status: "queued" | "running" | "succeeded" | "failed" | "unknown";
  raw?: Record<string, any> | null;
}) => Number((status.raw as any)?.code) === 4;

export const resolveKrnlTrackingStatus = async (args: {
  requestId?: string | null;
  krnlIntentId?: string | null;
  txIntentId?: string | null;
}): Promise<{
  status: "queued" | "running" | "succeeded" | "failed" | "unknown";
  txHash?: string;
  error?: string;
  raw?: Record<string, any> | null;
}> => {
  const requestId = args.requestId ?? null;
  const krnlIntentId = normalizeKrnlReturnedIntentId(args.krnlIntentId);
  const txIntentId = args.txIntentId ?? null;
  if (DEMO_MODE) {
    return {
      status: "queued",
      txHash: undefined,
      raw: {
        demo: true,
        requestId,
        krnlIntentId,
        txIntentId
      }
    };
  }

  // When KRNL intentId is absent, requestId HTTP status is the authoritative tracker.
  if (!krnlIntentId && requestId) {
    return getKrnlRunStatusHttp(requestId);
  }

  if (krnlIntentId) {
    const rpcStatus = await getKrnlRunStatus(krnlIntentId);
    if (isWrongKrnlRpcId(rpcStatus) && requestId) {
      console.warn(
        `[krnl] status id mismatch for krnlIntentId=${krnlIntentId}; switching to requestId=${requestId} http polling`
      );
      return getKrnlRunStatusHttp(requestId);
    }
    return rpcStatus;
  }

  if (requestId) {
    return getKrnlRunStatusHttp(requestId);
  }

  if (txIntentId) {
    const rpcStatus = await getKrnlRunStatus(txIntentId);
    if (isWrongKrnlRpcId(rpcStatus) && requestId) {
      console.warn(
        `[krnl] status id mismatch for txIntentId=${txIntentId}; switching to requestId=${requestId} http polling`
      );
      return getKrnlRunStatusHttp(requestId);
    }
    return rpcStatus;
  }

  throw new Error("Workflow run missing KRNL reference");
};

const resolveChainTxHash = async (txHash: string): Promise<string | null> => {
  const rpcUrl = process.env.RPC_SEPOLIA_URL || process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) return null;
  try {
    const { createPublicClient, http } = await import("viem");
    const { sepolia } = await import("viem/chains");
    const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    return txHash;
  } catch {
    return null;
  }
};

export type PollUntilTxHashResult = {
  ok: boolean;
  state: "queued" | "running" | "succeeded" | "failed";
  txHash: string | null;
  error?: string;
};

export const pollUntilTxHash = async (
  workflowRunId: string,
  timeoutMs = 300000,
  intervalMs = 2000
): Promise<PollUntilTxHashResult> => {
  const workflow = await prisma.workflowRun.findUnique({ where: { id: workflowRunId } });
  if (!workflow) {
    throw new Error("Workflow run missing KRNL reference");
  }
  const requestId = workflow.requestId ?? null;
  const txIntentId = workflow.txIntentId ?? null;
  const krnlIntentId = workflow.intentId ?? null;
  if (!requestId && !txIntentId && !krnlIntentId) {
    throw new Error("Workflow run missing KRNL reference");
  }

  let storedExecutionHash = workflow.krnlExecutionHash ?? null;
  let lastStatus: "queued" | "running" | "succeeded" | "failed" | "unknown" | null =
    workflow.status;
  const timeoutAt = Date.now() + timeoutMs;
  while (Date.now() < timeoutAt) {
    const status = await resolveKrnlTrackingStatus({
      requestId,
      krnlIntentId,
      txIntentId
    });
    console.log(
      `[krnl] poll requestId=${requestId ?? ""} txIntentId=${txIntentId ?? ""} status=${status.status} txHash=${status.txHash ?? ""}${krnlIntentId ? ` krnlIntentId=${krnlIntentId}` : ""}`
    );

    if (status.status === "failed") {
      const errorMessage = buildKrnlErrorMessage(
        status.raw ?? null,
        status.error ?? "KRNL run failed"
      );
      if (process.env.NODE_ENV !== "production" && status.raw) {
        console.error(`[krnl] workflow failed id=${workflowRunId}`, status.raw);
      }
      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: {
          status: "failed",
          error: errorMessage,
          krnlStatusJson: status.raw ?? undefined,
          stepsJson: status.raw?.steps ?? undefined,
          completedAt: new Date()
        }
      });
      return { ok: false, state: "failed", txHash: null, error: errorMessage };
    }

    const executionHash = status.txHash;
    if (executionHash && executionHash !== storedExecutionHash) {
      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: {
          krnlExecutionHash: executionHash,
          txHash: workflow.txHash ?? executionHash,
          krnlStatusJson: status.raw ?? undefined,
          stepsJson: status.raw?.steps ?? undefined
        }
      });
      storedExecutionHash = executionHash;
    }

    if (status.status === "succeeded") {
      if (executionHash) {
        const chainTxHash = await resolveChainTxHash(executionHash);
        if (chainTxHash) {
          await prisma.workflowRun.update({
            where: { id: workflowRunId },
            data: {
              status: "succeeded",
              chainTxHash,
              txHash: chainTxHash,
              krnlStatusJson: status.raw ?? undefined,
              stepsJson: status.raw?.steps ?? undefined,
              completedAt: new Date()
            }
          });
          return { ok: true, state: "succeeded", txHash: chainTxHash };
        }
      }
    }

    if (
      status.status !== "unknown" &&
      status.status !== lastStatus &&
      status.status !== "succeeded"
    ) {
      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: {
          status: status.status === "queued" ? "queued" : "running",
          krnlStatusJson: status.raw ?? undefined,
          stepsJson: status.raw?.steps ?? undefined
        }
      });
      lastStatus = status.status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const queuedLikeState = lastStatus === "running" ? "running" : "queued";
  return {
    ok: false,
    state: queuedLikeState,
    txHash: null
  };
};

export const pollUntilTxHashStrict = async (
  workflowRunId: string,
  timeoutMs = 300000,
  intervalMs = 2000
): Promise<string> => {
  const result = await pollUntilTxHash(workflowRunId, timeoutMs, intervalMs);
  if (result.ok && result.txHash) {
    return result.txHash;
  }
  if (result.state === "failed") {
    throw new Error(result.error ?? "KRNL run failed");
  }
  throw new Error(`Timed out waiting for KRNL txHash (state=${result.state})`);
};

export const pollUntilTxHashByIntent = async (
  workflowRunId: string,
  intentId?: string | null,
  timeoutMs = 300000,
  intervalMs = 2000
): Promise<string> => {
  const workflow = await prisma.workflowRun.findUnique({
    where: { id: workflowRunId },
    select: { requestId: true, txIntentId: true, intentId: true }
  });
  const requestId = workflow?.requestId ?? null;
  const txIntentId = workflow?.txIntentId ?? intentId ?? null;
  const krnlIntentId = workflow?.intentId ?? null;
  if (!requestId && !txIntentId && !krnlIntentId) {
    throw new Error("Missing KRNL intentId/requestId");
  }
  let storedExecutionHash: string | null = null;
  let lastStatus: "queued" | "running" | "succeeded" | "failed" | "unknown" | null = null;
  const timeoutAt = Date.now() + timeoutMs;
  while (Date.now() < timeoutAt) {
    const status = await resolveKrnlTrackingStatus({
      requestId,
      krnlIntentId,
      txIntentId
    });

    if (status.status === "failed") {
      const errorMessage = buildKrnlErrorMessage(
        status.raw ?? null,
        status.error ?? "KRNL run failed"
      );
      if (process.env.NODE_ENV !== "production" && status.raw) {
        console.error(`[krnl] workflow failed id=${workflowRunId}`, status.raw);
      }
      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: {
          status: "failed",
          error: errorMessage,
          krnlStatusJson: status.raw ?? undefined,
          stepsJson: status.raw?.steps ?? undefined,
          completedAt: new Date()
        }
      });
      throw new Error(errorMessage);
    }

    const executionHash = status.txHash;
    if (executionHash && executionHash !== storedExecutionHash) {
      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: {
          krnlExecutionHash: executionHash,
          txHash: executionHash,
          krnlStatusJson: status.raw ?? undefined,
          stepsJson: status.raw?.steps ?? undefined
        }
      });
      storedExecutionHash = executionHash;
    }

    if (status.status === "succeeded") {
      if (executionHash) {
        await prisma.workflowRun.update({
          where: { id: workflowRunId },
          data: {
            status: "succeeded",
            txHash: executionHash,
            krnlStatusJson: status.raw ?? undefined,
            stepsJson: status.raw?.steps ?? undefined,
            completedAt: new Date()
          }
        });
        return executionHash;
      }
    }

    if (status.status !== "unknown" && status.status !== lastStatus) {
      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: {
          status: status.status === "queued" ? "queued" : "running",
          krnlStatusJson: status.raw ?? undefined,
          stepsJson: status.raw?.steps ?? undefined
        }
      });
      lastStatus = status.status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  await prisma.workflowRun.update({
    where: { id: workflowRunId },
    data: {
      status: "failed",
      error: "Timed out waiting for KRNL txHash",
      completedAt: new Date()
    }
  });
  throw new Error("Timed out waiting for KRNL txHash");
};

const submitWorkflow = async (args: {
  type: WorkflowType;
  workflowRunType?: WorkflowRunType;
  brandId: string;
  walletAddress: string;
  questId?: string;
  zealyQuestId?: string;
  tokenId?: string;
  variables: Record<string, string | number | boolean>;
  secretsOverride?: Record<string, string>;
  expectedBaseUri?: string;
  scopeType?: "PLATFORM" | "BRAND";
  scopeId?: string | null;
  existingRunId?: string;
  actionQueueItemId?: string;
  extraMetadata?: Record<string, unknown>;
}): Promise<WorkflowSubmission> => {
  const {
    type,
    workflowRunType,
    brandId,
    walletAddress,
    questId,
    zealyQuestId,
    tokenId,
    variables,
    secretsOverride,
    expectedBaseUri,
    scopeType,
    scopeId,
    existingRunId,
    actionQueueItemId,
    extraMetadata
  } = args;
  const { renderedJson, templatePath } = await renderWorkflowTemplate({ type, variables });
  const renderedWithSecrets =
    secretsOverride && renderedJson && typeof renderedJson === "object" && !Array.isArray(renderedJson)
      ? {
          ...(renderedJson as Record<string, any>),
          _SECRETS: {
            ...(((renderedJson as Record<string, any>)._SECRETS as Record<string, string>) || {}),
            ...secretsOverride
          }
        }
      : renderedJson;

  const renderedWithMetadata =
    extraMetadata && renderedWithSecrets && typeof renderedWithSecrets === "object" && !Array.isArray(renderedWithSecrets)
      ? (() => {
          const record = renderedWithSecrets as Record<string, any>;
          const metadata =
            record.metadata && typeof record.metadata === "object" ? record.metadata : {};
          return {
            ...record,
            metadata: {
              ...(metadata as Record<string, any>),
              ...extraMetadata
            }
          };
        })()
      : renderedWithSecrets;
  const renderedWithDemoMetadata =
    DEMO_MODE &&
    renderedWithMetadata &&
    typeof renderedWithMetadata === "object" &&
    !Array.isArray(renderedWithMetadata)
      ? (() => {
          const record = renderedWithMetadata as Record<string, any>;
          const metadata =
            record.metadata && typeof record.metadata === "object" ? record.metadata : {};
          return {
            ...record,
            metadata: {
              ...(metadata as Record<string, any>),
              demo: true,
              action: mapWorkflowTypeToDemoAction(type),
              brandId,
              wallet: walletAddress,
              payload: {
                brandId,
                wallet: walletAddress,
                tokenId: tokenId ?? null,
                questId: questId ?? null,
                zealyQuestId: zealyQuestId ?? null
              }
            }
          };
        })()
      : renderedWithMetadata;
  const txIntentId = resolveCanonicalWorkflowIntentId({
    workflowJson: renderedWithDemoMetadata
  });

  const workflowMeta = (renderedWithDemoMetadata as any)?.workflow;
  const workflowName =
    typeof workflowMeta?.name === "string" && workflowMeta.name.trim()
      ? workflowMeta.name.trim()
      : undefined;
  const steps = workflowMeta?.steps;
  const stepNames = Array.isArray(steps)
    ? steps.map((step: any) => step?.name).filter(Boolean)
    : [];
  const targetFunction = (renderedWithDemoMetadata as any)?.target?.function;
  const targetParameters = (renderedWithDemoMetadata as any)?.target?.parameters;
  const authDataResultExists = Boolean((renderedWithDemoMetadata as any)?.target?.authData_result);
  const systemExecutorSummary = summarizeSystemExecutorDeclaration(renderedWithDemoMetadata);

  console.log(
    `[workflow] submit name=${workflowMeta?.name ?? "unknown"} version=${workflowMeta?.version ?? "unknown"} steps=${Array.isArray(steps) ? steps.length : 0} stepNames=${stepNames.join(",")} systemExecutors=${systemExecutorSummary} targetFunction=${targetFunction ?? ""} targetParameters=${Array.isArray(targetParameters) ? JSON.stringify(targetParameters) : ""} authDataResult=${authDataResultExists}`
  );

  if (!Array.isArray(steps) || steps.length === 0) {
    const message = "Rendered workflow has no steps; template/render bug";
    console.error(
      `[workflow] ${message} template=${templatePath} name=${workflowMeta?.name ?? "unknown"} version=${workflowMeta?.version ?? "unknown"}`
    );
    throw new Error(message);
  }

  const workflowRunId = existingRunId ?? randomUUID();
  const scopeTypeValue = scopeType ?? "BRAND";
  const scopeIdValue = scopeId !== undefined ? scopeId : brandId;
  const runType: WorkflowRunType = workflowRunType ?? mapWorkflowTypeToRunType(type);
  try {
    if (existingRunId) {
      await prisma.workflowRun.update({
        where: { id: existingRunId },
        data: {
          status: "queued",
          scopeType: scopeTypeValue,
          scopeId: scopeIdValue,
          expectedBaseUri: expectedBaseUri ?? undefined,
          workflowName,
          actionQueueItemId: actionQueueItemId ?? undefined,
          renderedWorkflowJson: renderedWithDemoMetadata as Prisma.InputJsonValue
        }
      });
    }

    const {
      requestId,
      txIntentId: submittedTxIntentId,
      krnlIntentId: submittedKrnlIntentId,
      krnlMethod
    } = await submitWorkflowToKrnl(
      renderedWithDemoMetadata
    );
    const resolvedTxIntentId = submittedTxIntentId ?? txIntentId ?? null;
    const normalizedKrnlIntentId = normalizeKrnlReturnedIntentId(submittedKrnlIntentId);
    if (!normalizedKrnlIntentId && resolvedTxIntentId) {
      console.log(
        `[workflow] preserving txIntentId=${resolvedTxIntentId} because KRNL returned empty intentId`
      );
    }
    const workflowLogSuffix = normalizedKrnlIntentId
      ? ` krnlIntentId=${normalizedKrnlIntentId}`
      : "";
    console.log(
      `[workflow] ids requestId=${requestId ?? ""} txIntentId=${resolvedTxIntentId ?? ""}${workflowLogSuffix}`
    );
    const renderedForStorage = attachSubmitMetadata(renderedWithDemoMetadata, krnlMethod);
    const krnlRunRefValue = requestId ?? normalizedKrnlIntentId ?? resolvedTxIntentId ?? null;

    if (existingRunId) {
      await prisma.workflowRun.update({
        where: { id: existingRunId },
        data: {
          krnlRunRef: krnlRunRefValue,
          txIntentId: resolvedTxIntentId,
          requestId,
          intentId: normalizedKrnlIntentId ?? null,
          workflowName,
          actionQueueItemId: actionQueueItemId ?? undefined,
          renderedWorkflowJson: renderedForStorage as Prisma.InputJsonValue
        }
      });
    } else {
      await prisma.workflowRun.create({
        data: {
          id: workflowRunId,
          brandId,
          type: runType,
          workflowName,
          status: "queued",
          wallet: walletAddress,
          questId,
          zealyQuestId,
          tokenId,
          expectedBaseUri: expectedBaseUri ?? null,
          scopeType: scopeTypeValue,
          scopeId: scopeIdValue,
          actionQueueItemId: actionQueueItemId ?? null,
          krnlRunRef: krnlRunRefValue,
          txIntentId: resolvedTxIntentId,
          requestId,
          intentId: normalizedKrnlIntentId ?? null,
          renderedWorkflowJson: renderedForStorage as Prisma.InputJsonValue
        }
      });
    }

    return {
      workflowRunId,
      status: "queued",
      requestId,
      intentId: resolvedTxIntentId ?? normalizedKrnlIntentId ?? null,
      txIntentId: resolvedTxIntentId,
      krnlIntentId: normalizedKrnlIntentId
    };
  } catch (error) {
    const requestId =
      typeof (error as { krnlRequestId?: string }).krnlRequestId === "string"
        ? (error as { krnlRequestId?: string }).krnlRequestId
        : undefined;
    const krnlIntentId =
      typeof (error as { krnlIntentId?: string }).krnlIntentId === "string"
        ? (error as { krnlIntentId?: string }).krnlIntentId
        : undefined;
    const resolvedTxIntentId = txIntentId ?? resolveCanonicalWorkflowIntentId({
      workflowJson: renderedWithDemoMetadata
    });
    const normalizedKrnlIntentId = normalizeKrnlReturnedIntentId(krnlIntentId);
    const krnlMethod =
      typeof (error as { krnlMethod?: string }).krnlMethod === "string"
        ? (error as { krnlMethod?: string }).krnlMethod
        : undefined;
    const renderedForStorage =
      krnlMethod && renderedWithDemoMetadata
        ? attachSubmitMetadata(renderedWithDemoMetadata, krnlMethod)
        : renderedWithDemoMetadata;
    const raw = (error as any)?.krnlRaw as Record<string, any> | undefined;
    const errorMessage = buildKrnlErrorMessage(raw ?? null, (error as Error).message);
    const krnlRunRefValue = requestId ?? normalizedKrnlIntentId ?? resolvedTxIntentId ?? null;
    if (existingRunId) {
      await prisma.workflowRun.update({
        where: { id: existingRunId },
        data: {
          status: "failed",
          error: errorMessage,
          completedAt: new Date(),
          krnlRunRef: krnlRunRefValue,
          txIntentId: resolvedTxIntentId ?? null,
          requestId,
          intentId: normalizedKrnlIntentId ?? null,
          workflowName,
          actionQueueItemId: actionQueueItemId ?? undefined,
          renderedWorkflowJson: renderedForStorage as Prisma.InputJsonValue
        }
      });
    } else {
      await prisma.workflowRun.create({
        data: {
          id: workflowRunId,
          brandId,
          type: runType,
          workflowName,
          status: "failed",
          wallet: walletAddress,
          questId,
          zealyQuestId,
          tokenId,
          expectedBaseUri: expectedBaseUri ?? null,
          scopeType: scopeTypeValue,
          scopeId: scopeIdValue,
          actionQueueItemId: actionQueueItemId ?? null,
          krnlRunRef: krnlRunRefValue,
          txIntentId: resolvedTxIntentId ?? null,
          requestId,
          intentId: normalizedKrnlIntentId ?? null,
          renderedWorkflowJson: renderedForStorage as Prisma.InputJsonValue,
          error: errorMessage,
          completedAt: new Date()
        }
      });
    }
    throw error;
  }
};

export const submitMintWorkflow = async ({
  brandId,
  walletAddress,
  workflowRunType,
  transactionIntentDelegate,
  transactionIntentId,
  transactionIntentDeadline,
  userSignature,
  actionQueueItemId
}: MintWorkflowInput): Promise<WorkflowSubmission> => {
  const { brand, nftConfig } = await getBrandAndConfig(brandId);
  const base = await baseVariables(brand, walletAddress, nftConfig, {
    transactionIntentDelegate,
    transactionIntentId,
    transactionIntentDeadline,
    userSignature
  });
  const variables = {
    ...base,
    brandId,
    to: walletAddress
  };

  return submitWorkflow({
    type: "mint",
    workflowRunType: workflowRunType ?? "MINT_BASE_NFT",
    brandId,
    walletAddress,
    variables,
    actionQueueItemId
  });
};

export const submitQuestRewardWorkflow = async ({
  brandId,
  walletAddress,
  zealyQuestId,
  questId,
  tokenId,
  authResultHex,
  authSignatureHex,
  transactionIntentDelegate,
  transactionIntentId,
  transactionIntentDeadline,
  userSignature,
  actionQueueItemId
}: QuestRewardWorkflowInput): Promise<WorkflowSubmission> => {
  const { brand, nftConfig } = await getBrandAndConfig(brandId);
  const zealyConfig = await getZealyConfigForBrand(brandId);

  const variables = {
    ...(await baseVariables(brand, walletAddress, nftConfig, {
      transactionIntentDelegate,
      transactionIntentId,
      transactionIntentDeadline,
      userSignature
    })),
    ZEALY_SUBDOMAIN: zealyConfig.zealySubdomain,
    ZEALY_API_KEY: zealyConfig.zealyApiKey,
    ZEALY_QUEST_ID: zealyQuestId ?? "",
    QUEST_ID: questId ?? "",
    TOKEN_ID: tokenId ?? "0",
    XP_DELTA: 0,
    AUTH_RESULT: authResultHex,
    AUTH_SIGNATURE: authSignatureHex
  };

  return submitWorkflow({
    type: "quest_reward",
    workflowRunType: "QUEST_REWARD",
    brandId,
    walletAddress,
    questId,
    zealyQuestId,
    tokenId,
    variables,
    actionQueueItemId
  });
};

export const submitLootboxWorkflow = async ({
  brandId,
  walletAddress,
  tokenId,
  authResultHex,
  authSignatureHex,
  workflowRunType,
  transactionIntentDelegate,
  transactionIntentId,
  transactionIntentDeadline,
  userSignature,
  actionQueueItemId
}: LootboxWorkflowInput): Promise<WorkflowSubmission> => {
  const { brand, nftConfig } = await getBrandAndConfig(brandId);

  const variables = {
    ...(await baseVariables(brand, walletAddress, nftConfig, {
      transactionIntentDelegate,
      transactionIntentId,
      transactionIntentDeadline,
      userSignature
    })),
    TOKEN_ID: tokenId,
    brandId,
    tokenId,
    AUTH_RESULT: authResultHex,
    AUTH_SIGNATURE: authSignatureHex
  };

  return submitWorkflow({
    type: "lootbox",
    workflowRunType: workflowRunType ?? "OPEN_LOOTBOX",
    brandId,
    walletAddress,
    tokenId,
    variables,
    actionQueueItemId
  });
};

export const submitSetActiveTraitsWorkflow = async ({
  brandId,
  walletAddress,
  tokenId,
  traitSelections,
  actionQueueItemId
}: SetActiveTraitsWorkflowInput): Promise<WorkflowSubmission> => {
  const { brand, nftConfig } = await getBrandAndConfig(brandId);

  const { authResultHex, authSignatureHex } = encodeLootboxAuthData({
    tokenId,
    traitUpdates: traitSelections.map((trait) => ({
      key: trait.traitKey,
      value: trait.traitValue
    }))
  });

  const variables = {
    ...(await baseVariables(brand, walletAddress, nftConfig)),
    TOKEN_ID: tokenId,
    brandId,
    tokenId,
    AUTH_RESULT: authResultHex,
    AUTH_SIGNATURE: authSignatureHex,
    ACTIVE_TRAITS_JSON: JSON.stringify(traitSelections),
    TRAIT_UPDATES_JSON: JSON.stringify(traitSelections),
    traitKeys: JSON.stringify(traitSelections.map((trait) => trait.traitKey)),
    traitValues: JSON.stringify(traitSelections.map((trait) => trait.traitValue))
  };

  return submitWorkflow({
    type: "set_active_traits",
    workflowRunType: "SET_ACTIVE_TRAITS",
    brandId,
    walletAddress,
    tokenId,
    variables,
    actionQueueItemId,
    extraMetadata: {
      selectedTraits: traitSelections
    }
  });
};
