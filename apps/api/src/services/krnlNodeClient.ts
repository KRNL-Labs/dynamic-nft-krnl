type SubmitWorkflowArgs = {
  workflowJson: unknown;
};

type SubmitWorkflowResult = {
  requestId: string;
  intentId?: string | null;
  krnlIntentId?: string | null;
  admissionResult?: unknown;
  workflowName?: string;
  krnlMethod: string;
  raw: unknown;
};

type GetRunStatusArgs = {
  requestId: string;
};

type GetRunStatusResult = {
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
  code?: number;
  error?: string;
  txHash?: string;
  raw: unknown;
};

type GetRunStatusHttpResult = {
  status?: string;
  txHash?: string;
  raw: unknown;
};

const KRNL_NODE_URL = process.env.KRNL_NODE_URL;
const SUBMIT_METHOD = "krnl_executeWorkflow";
const KRNL_RPC_STATUS_METHOD = process.env.KRNL_RPC_STATUS_METHOD || "krnl_workflowStatus";
const KRNL_STATUS_PATH_TEMPLATE =
  process.env.KRNL_STATUS_PATH_TEMPLATE || "/workflow/{{id}}";
const SEPOLIA_RPC_URL = process.env.RPC_SEPOLIA_URL;
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
const DEMO_MODE = String(process.env.DEMO_MODE || "").toLowerCase() === "true";

if (
  process.env.NODE_ENV !== "production" &&
  process.env.KRNL_RPC_METHOD &&
  process.env.KRNL_RPC_METHOD.trim() !== SUBMIT_METHOD
) {
  console.warn(
    `[krnl] KRNL_RPC_METHOD is ignored; using ${SUBMIT_METHOD} only`
  );
}

let rpcIdCounter = 1;
const nextRpcId = () => rpcIdCounter++;

const buildUrl = () => {
  const base = KRNL_NODE_URL || "https://node.krnl.xyz";
  return base.replace(/\/+$/, "");
};

const resolveStatusPath = (requestId: string) => {
  const replaced = KRNL_STATUS_PATH_TEMPLATE.replace("{{id}}", requestId);
  return replaced.startsWith("/") ? replaced : `/${replaced}`;
};

const parseJson = async (response: { text: () => Promise<string> }) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const attachSecrets = (workflowJson: unknown) => {
  if (!workflowJson || typeof workflowJson !== "object" || Array.isArray(workflowJson)) {
    return workflowJson;
  }

  const payload = workflowJson as Record<string, any>;
  const existingSecrets = payload._SECRETS && typeof payload._SECRETS === "object"
    ? (payload._SECRETS as Record<string, string>)
    : {};

  const rpcSepoliaURL = SEPOLIA_RPC_URL || existingSecrets.rpcSepoliaURL;
  const pimlicoKey = PIMLICO_API_KEY || existingSecrets["pimlico-apikey"];

  if (!rpcSepoliaURL) {
    throw new Error("Missing _SECRETS.rpcSepoliaURL (set RPC_SEPOLIA_URL in .env)");
  }
  if (!pimlicoKey) {
    throw new Error("Missing _SECRETS.pimlico-apikey (set PIMLICO_API_KEY in .env)");
  }

  const secrets: Record<string, string> = {
    rpcSepoliaURL,
    "pimlico-apikey": pimlicoKey
  };

  return {
    ...payload,
    _SECRETS: {
      ...existingSecrets,
      ...secrets
    }
  };
};

const extractRequestId = (raw: unknown): string | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, any>;
  return (
    (data.requestId as string | undefined) ||
    (data.request_id as string | undefined) ||
    (data.result?.requestId as string | undefined) ||
    (data.result?.request_id as string | undefined)
  );
};

const extractIntentId = (raw: unknown): string | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, any>;
  return (
    (data.intentId as string | undefined) ||
    (data.intent_id as string | undefined) ||
    (data.result?.intentId as string | undefined) ||
    (data.result?.intent_id as string | undefined)
  );
};

const normalizeIntentId = (value: string | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const looksLikeTxHash = (value: unknown) =>
  typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);

const findTxHashDeep = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (looksLikeTxHash(value)) return value as string;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTxHashDeep(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, any>;
    const direct = record.txHash || record.transactionHash;
    if (looksLikeTxHash(direct)) return direct;
    for (const key of Object.keys(record)) {
      const found = findTxHashDeep(record[key]);
      if (found) return found;
    }
  }
  return undefined;
};

const extractTxHashFromResultString = (value: string): string | undefined => {
  const match = value.match(/0x[a-fA-F0-9]{64}/);
  if (match) return match[0];
  try {
    const parsed = JSON.parse(value);
    return findTxHashDeep(parsed);
  } catch {
    return undefined;
  }
};

const extractStatusValue = (raw: unknown): string | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, any>;
  return (
    (data.status as string | undefined) ||
    (data.state as string | undefined) ||
    (data.workflowStatus as string | undefined) ||
    (data.data?.status as string | undefined) ||
    (data.data?.state as string | undefined) ||
    (data.data?.workflowStatus as string | undefined) ||
    (data.result?.status as string | undefined) ||
    (data.result?.state as string | undefined) ||
    (data.result?.workflowStatus as string | undefined)
  );
};

const normalizeStatus = (rawStatus: string): GetRunStatusResult["status"] => {
  const value = rawStatus.toLowerCase().trim();
  if (["pending", "queued"].includes(value)) return "PENDING";
  if (["processing", "running", "in_progress"].includes(value)) return "PROCESSING";
  if (["success", "succeeded", "completed", "complete"].includes(value)) return "SUCCESS";
  if (["failed", "error"].includes(value)) return "FAILED";
  return "PENDING";
};

const extractTxHash = (raw: unknown): string | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, any>;
  return (
    (data.txHash as string | undefined) ||
    (data.transactionHash as string | undefined) ||
    (data.tx_hash as string | undefined) ||
    (data.result?.txHash as string | undefined) ||
    (data.result?.transactionHash as string | undefined) ||
    (data.result?.tx_hash as string | undefined) ||
    (data.data?.txHash as string | undefined) ||
    (data.data?.transactionHash as string | undefined) ||
    (data.data?.tx_hash as string | undefined)
  );
};

const sanitizePayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return payload;
  const record = payload as Record<string, any>;
  if (record._SECRETS && typeof record._SECRETS === "object") {
    const secrets = record._SECRETS as Record<string, string>;
    return {
      ...record,
      _SECRETS: Object.fromEntries(Object.keys(secrets).map((key) => [key, "***"]))
    };
  }
  return payload;
};

const summarizeSystemExecutorDeclaration = (payload: unknown): string => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "none";
  const record = payload as Record<string, any>;
  const candidates = [
    record.systemExecutors,
    record.system_executors,
    record.systemExecutor,
    record.system_executor,
    record.workflow?.systemExecutors,
    record.workflow?.system_executors,
    record.workflow?.systemExecutor,
    record.workflow?.system_executor
  ];
  const value = candidates.find((entry) => entry !== undefined);
  if (value === undefined || value === null) return "none";
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (typeof value === "object") {
    return `object(keys=${Object.keys(value as Record<string, unknown>).join(",")})`;
  }
  return typeof value;
};

export const submitWorkflow = async ({
  workflowJson
}: SubmitWorkflowArgs): Promise<SubmitWorkflowResult> => {
  const workflowPayload = attachSecrets(workflowJson);
  const url = buildUrl();
  const requestId = nextRpcId();
  const requestBody = {
    jsonrpc: "2.0",
    id: requestId,
    method: SUBMIT_METHOD,
    params: [workflowPayload]
  };

  console.log(`[krnl] submit url=${url} method=${SUBMIT_METHOD}`);
  const workflowMeta = (workflowPayload as any)?.workflow;
  const stepCount = Array.isArray(workflowMeta?.steps) ? workflowMeta.steps.length : 0;
  console.log(
    `[krnl] payload name=${workflowMeta?.name ?? "unknown"} version=${workflowMeta?.version ?? "unknown"} steps=${stepCount} systemExecutors=${summarizeSystemExecutorDeclaration(workflowPayload)}`
  );
  if (process.env.NODE_ENV !== "production") {
    console.log(`[krnl] submit request: ${JSON.stringify(sanitizePayload(requestBody))}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  const raw = await parseJson(response);
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[krnl] submit response (${SUBMIT_METHOD}) status=${response.status} body=${JSON.stringify(raw)}`
    );
  }

  if (!response.ok) {
    const snippet = typeof raw === "string" ? raw : JSON.stringify(raw)?.slice(0, 1000);
    const err = new Error(`KRNL submission failed (${response.status}): ${snippet}`);
    (err as any).krnlRequestId = requestId;
    (err as any).krnlMethod = SUBMIT_METHOD;
    (err as any).krnlRaw = raw;
    throw err;
  }

  if (raw && typeof raw === "object" && "error" in (raw as any)) {
    const errorObj = (raw as any).error as { code?: number; message?: string };
    const err = new Error(`KRNL submission error: ${errorObj?.message ?? "unknown error"}`);
    (err as any).krnlRequestId = requestId;
    (err as any).krnlMethod = SUBMIT_METHOD;
    (err as any).krnlRaw = raw;
    throw err;
  }

  try {
    const parsed = parseSubmitWorkflowResult(raw);
    return {
      ...parsed,
      krnlMethod: SUBMIT_METHOD
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    (err as any).krnlRequestId = requestId;
    (err as any).krnlMethod = SUBMIT_METHOD;
    throw err;
  }
};

export const parseSubmitWorkflowResult = (
  raw: unknown
): Omit<SubmitWorkflowResult, "krnlMethod"> => {
  const resultPayload = (raw as any)?.result ?? raw;
  const requestIdValue = extractRequestId(resultPayload);
  if (!requestIdValue) {
    const snippet = typeof raw === "string" ? raw : JSON.stringify(raw);
    throw new Error(`KRNL response missing requestId: ${snippet}`);
  }
  const intentId = normalizeIntentId(extractIntentId(resultPayload));
  const admissionResult =
    (resultPayload as any)?.admissionResult ?? (resultPayload as any)?.admission_result;
  const workflowName =
    (resultPayload as any)?.workflowName ?? (resultPayload as any)?.workflow_name;

  return {
    requestId: requestIdValue,
    intentId,
    krnlIntentId: intentId,
    admissionResult,
    workflowName,
    raw: resultPayload
  };
};

export const getRunStatusHttp = async ({
  requestId
}: GetRunStatusArgs): Promise<GetRunStatusHttpResult> => {
  const url = `${buildUrl()}${resolveStatusPath(requestId)}`;
  if (process.env.NODE_ENV !== "production") {
    console.log(`[krnl] status http request: ${url}`);
  }
  const response = await fetch(url, { method: "GET" });
  const raw = await parseJson(response);
  if (!response.ok) {
    const snippet = typeof raw === "string" ? raw : JSON.stringify(raw)?.slice(0, 1000);
    throw new Error(`KRNL status http failed (${response.status}): ${snippet}`);
  }
  const resultPayload = (raw as any)?.result ?? raw;
  const status = extractStatusValue(resultPayload);
  let txHash = extractTxHash(resultPayload);
  if (!txHash && typeof resultPayload === "string") {
    txHash = extractTxHashFromResultString(resultPayload);
  } else if (!txHash) {
    txHash = findTxHashDeep(resultPayload);
  }
  return { status, txHash, raw: resultPayload };
};

export const pingKrnlNode = async () => {
  if (DEMO_MODE) {
    return {
      status: 200,
      request: { mode: "demo" },
      response: { ok: true, demo: true }
    };
  }
  const url = buildUrl();
  const requestId = nextRpcId();
  const requestBody = {
    jsonrpc: "2.0",
    id: requestId,
    method: SUBMIT_METHOD,
    params: []
  };

  console.log(`[krnl] ping url=${url} method=${SUBMIT_METHOD}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  const raw = await parseJson(response);
  return { status: response.status, request: requestBody, response: raw };
};

export const getRunStatus = async ({
  requestId: krnlRequestId
}: GetRunStatusArgs): Promise<GetRunStatusResult> => {
  const rpcId = nextRpcId();
  const requestBody = {
    jsonrpc: "2.0",
    id: rpcId,
    method: KRNL_RPC_STATUS_METHOD,
    params: [krnlRequestId]
  };

  if (process.env.NODE_ENV !== "production") {
    console.log(`[krnl] status request: ${JSON.stringify(requestBody)}`);
  }

  const url = buildUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  const raw = await parseJson(response);
  if (!response.ok) {
    const snippet = typeof raw === "string" ? raw : JSON.stringify(raw)?.slice(0, 1000);
    throw new Error(`KRNL status fetch failed (${response.status}): ${snippet}`);
  }

  if (raw && typeof raw === "object" && "error" in (raw as any)) {
    const errorObj = (raw as any).error as { code?: number; message?: string };
    if (errorObj?.code === -32601) {
      throw new Error(
        `KRNL RPC status method not found: ${KRNL_RPC_STATUS_METHOD} at ${KRNL_NODE_URL || "https://node.krnl.xyz"}`
      );
    }
    throw new Error(`KRNL status error: ${errorObj?.message ?? "unknown error"}`);
  }

  const resultPayload = (raw as any)?.result ?? raw;
  const codeValue = (resultPayload as any)?.code;
  const code = typeof codeValue === "number" ? codeValue : undefined;
  const codeError =
    (resultPayload as any)?.err ||
    (resultPayload as any)?.error ||
    (resultPayload as any)?.errorMessage;

  if (code === 0) {
    return { status: "PENDING", code, txHash: undefined, raw: resultPayload };
  }
  if (code === 1) {
    return { status: "PROCESSING", code, txHash: undefined, raw: resultPayload };
  }
  if (code === 2) {
    // success path falls through to tx hash extraction below
  } else if (code === 3) {
    return {
      status: "FAILED",
      code,
      error: typeof codeError === "string" ? codeError : "KRNL workflow failed",
      txHash: undefined,
      raw: resultPayload
    };
  } else if (code === 4) {
    return {
      status: "FAILED",
      code,
      error: typeof codeError === "string" ? codeError : "INTENT_NOT_FOUND",
      txHash: undefined,
      raw: resultPayload
    };
  } else if (code === 5) {
    return {
      status: "FAILED",
      code,
      error: typeof codeError === "string" ? codeError : "WORKFLOW_NOT_FOUND",
      txHash: undefined,
      raw: resultPayload
    };
  } else if (code === 6) {
    return {
      status: "FAILED",
      code,
      error: typeof codeError === "string" ? codeError : "INVALID",
      txHash: undefined,
      raw: resultPayload
    };
  }

  const rawStatus = extractStatusValue(resultPayload);
  const status = rawStatus ? normalizeStatus(rawStatus) : "PENDING";
  let txHash = extractTxHash(resultPayload);
  const resultField = (resultPayload as any)?.result;
  if (!txHash && typeof resultField === "string") {
    txHash = extractTxHashFromResultString(resultField);
  } else if (!txHash) {
    txHash = findTxHashDeep(resultField);
  }

  return {
    status,
    code,
    error: typeof codeError === "string" ? codeError : undefined,
    txHash,
    raw: resultPayload
  };
};
