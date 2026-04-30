type Args = {
  baseUrl: string;
  brandId: string;
  authToken: string;
  internalApiKey: string;
  timeoutMs?: number;
};

const argv = process.argv.slice(2);
const argMap = new Map<string, string>();
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = argv[i + 1];
  if (next && !next.startsWith("--")) {
    argMap.set(key, next);
    i += 1;
  } else {
    argMap.set(key, "true");
  }
}

const baseUrl = argMap.get("base-url") || process.env.API_BASE_URL || "http://localhost:3000";
const brandId = argMap.get("brand-id") || process.env.BRAND_ID || "";
const authToken = argMap.get("auth-token") || process.env.AUTH_TOKEN || "";
const internalApiKey = argMap.get("internal-api-key") || process.env.INTERNAL_API_KEY || "";
const timeoutMsValue = argMap.get("timeout-ms") || process.env.TIMEOUT_MS || "";
const timeoutMs = timeoutMsValue ? Number(timeoutMsValue) : undefined;

const args: Args = { baseUrl, brandId, authToken, internalApiKey, timeoutMs };

const logStep = (message: string) => {
  console.log(`\n==> ${message}`);
};

const logOk = (message: string) => {
  console.log(`✔ ${message}`);
};

const logFail = (message: string) => {
  console.error(`✖ ${message}`);
};

const assertInput = () => {
  const missing: string[] = [];
  if (!args.brandId) missing.push("BRAND_ID");
  if (!args.internalApiKey) missing.push("INTERNAL_API_KEY");
  if (!args.authToken) missing.push("AUTH_TOKEN");
  if (missing.length > 0) {
    logFail(`Missing required inputs: ${missing.join(", ")}`);
    process.exit(1);
  }
};

const buildUrl = (path: string) => new URL(path, args.baseUrl).toString();

const authHeaders = () => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.authToken}`
  };
  if (args.internalApiKey) {
    headers["x-internal-api-key"] = args.internalApiKey;
  }
  return headers;
};

const fetchJson = async <T>(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Promise<T> => {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    ...options.headers
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${text}`);
  }
  return data as T;
};

const main = async () => {
  assertInput();
  let pass = true;

  try {
    logStep("Submit set-metadata-base-uri workflow");
    const submitResponse = await fetchJson<{ workflowRunId?: string }>(
      `/api/brands/${args.brandId}/nft/set-metadata-base-uri-onchain`,
      {
        method: "POST",
        headers: authHeaders()
      }
    );
    const workflowRunId = submitResponse.workflowRunId;
    if (!workflowRunId) {
      throw new Error("Missing workflowRunId from submission response");
    }
    logOk(`Workflow submitted (${workflowRunId})`);

    logStep("Poll workflow until txHash");
    if (args.timeoutMs) {
      console.log(`Using backend poll endpoint timeout (server default), requested ${args.timeoutMs}ms`);
    }
    const pollResponse = await fetchJson<{ txHash?: string }>(
      `/api/brands/${args.brandId}/workflows/${workflowRunId}/poll`,
      { method: "POST", headers: authHeaders() }
    );
    if (!pollResponse.txHash) {
      throw new Error("Polling did not return a txHash");
    }
    logOk(`Workflow succeeded (txHash=${pollResponse.txHash})`);

    logStep("Verify on-chain base URI");
    const onchainResponse = await fetchJson<{ matches?: boolean }>(
      `/api/brands/${args.brandId}/nft/metadata-base-uri/onchain`,
      { headers: authHeaders() }
    );
    if (!onchainResponse.matches) {
      throw new Error("On-chain base URI does not match recommended");
    }
    logOk("On-chain base URI matches recommended");
  } catch (error) {
    pass = false;
    logFail((error as Error).message);
  }

  if (pass) {
    console.log("\nPASS: KRNL set-base-uri integration test passed");
    process.exit(0);
  } else {
    console.error("\nFAIL: KRNL set-base-uri integration test failed");
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
