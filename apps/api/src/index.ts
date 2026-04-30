import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import fs from "fs";
import path from "path";
import billingRouter from "./routes/billing";
import brandsRouter from "./routes/brands";
import devRouter from "./routes/dev";
import healthRouter from "./routes/health";
import internalRouter from "./routes/internal";
import metadataRouter from "./routes/metadata";
import authRouter from "./routes/auth";
import meRouter from "./routes/me";
import zealyRouter from "./routes/zealy";
import workflowsRouter from "./routes/workflows";
import systemRouter from "./routes/system";
import traitsRouter from "./routes/traits";
import { startKrnlRunPoller } from "./services/krnlRunPoller";
import { startZealyAutomationWorkers } from "./services/zealyAutomationWorker";
import { prisma } from "./db";

const app = express();

const devOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const apiDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001"
];
const apiExposeHeaders = [
  "payment-required",
  "payment-response",
  "PAYMENT-REQUIRED",
  "PAYMENT-RESPONSE"
].join(",");
const apiAllowHeadersFallback = [
  "content-type",
  "authorization",
  "x-privy-token",
  "x-user-id",
  "x-wallet-address",
  "x-internal-api-key",
  "payment-signature",
  "payment-required",
  "payment-response",
  "Content-Type",
  "Authorization",
  "X-Privy-Token",
  "X-User-Id",
  "X-Wallet-Address",
  "X-Internal-Api-Key",
  "PAYMENT-SIGNATURE",
  "PAYMENT-REQUIRED",
  "PAYMENT-RESPONSE"
].join(",");

app.use("/api", (req, res, next) => {
  const origin = req.header("origin");
  const isDev = process.env.NODE_ENV !== "production";
  const isAllowedOrigin = origin
    ? isDev
      ? apiDevOrigins.includes(origin)
      : origin === allowedOrigin
    : false;

  if (isAllowedOrigin && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Expose-Headers", apiExposeHeaders);
  }

  if (req.method === "OPTIONS") {
    const requested = req.header("access-control-request-headers");
    if (isAllowedOrigin && origin) {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Max-Age", "86400");
      res.setHeader("Access-Control-Allow-Headers", requested || apiAllowHeadersFallback);
    }
    if (isDev) {
      console.log(
        `[CORS] OPTIONS ${req.originalUrl} origin=${origin ?? ""} requested=${requested ?? ""} allow=${requested || apiAllowHeadersFallback}`
      );
    }
    return res.status(204).send();
  }

  return next();
});
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== "production") {
      return callback(null, devOrigins.includes(origin));
    }
    return callback(null, origin === allowedOrigin);
  },
  credentials: true,
  exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-privy-token",
    "x-user-id",
    "x-wallet-address",
    "x-internal-api-key",
    "PAYMENT-SIGNATURE",
    "PAYMENT-REQUIRED",
    "PAYMENT-RESPONSE",
    "X-PAYMENT",
    "X402-PAYMENT",
    "X-PAYMENT-SIGNATURE"
  ],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("/api/*", cors(corsOptions));

if (!process.env.PUBLIC_BASE_URL && process.env.NODE_ENV !== "production") {
  console.warn("[startup] PUBLIC_BASE_URL is not set; metadata base URI may be incorrect.");
}

const validateMetadataBaseUrl = () => {
  const value =
    process.env.GLOBAL_METADATA_BASE_URI || process.env.METADATA_BASE_URL || "";
  if (!value) {
    console.error("[startup] GLOBAL_METADATA_BASE_URI not configured");
    return null;
  }
  try {
    new URL(value);
  } catch {
    console.error("[startup] GLOBAL_METADATA_BASE_URI is not a valid URL");
    return null;
  }
  if (!value.endsWith("/")) {
    console.error("[startup] GLOBAL_METADATA_BASE_URI must end with /");
    return null;
  }
  return value;
};

const resolvedMetadataBaseUrl = validateMetadataBaseUrl();
const resolvedChainId = process.env.KRNL_DEFAULT_CHAIN_ID || process.env.CHAIN_ID || "11155111";
const resolvedContract = process.env.DEFAULT_NFT_CONTRACT_ADDRESS || "";
console.info(
  `[startup] config chainId=${resolvedChainId} contract=${resolvedContract || "(unset)"} metadataBaseUrl=${
    resolvedMetadataBaseUrl || "(unset)"
  }`
);

const assertNoLocalWorkflowTemplates = () => {
  const repoRoot = process.cwd();
  const defaultTemplatesDir = path.resolve(repoRoot, "packages/workflows/workflows");
  const templatesDir = process.env.WORKFLOW_TEMPLATES_DIR || defaultTemplatesDir;
  const resolvedTemplatesDir = path.resolve(templatesDir);
  const violations: string[] = [];

  const workflowsDir = path.join(repoRoot, "workflows");
  if (fs.existsSync(workflowsDir)) {
    const resolvedWorkflowsDir = path.resolve(workflowsDir);
    if (resolvedWorkflowsDir !== resolvedTemplatesDir) {
      violations.push(`Local ./workflows directory exists at ${resolvedWorkflowsDir}`);
    }
  }

  const excluded = new Set(["node_modules", "dist", "build", ".git"]);
  const foundTemplates: string[] = [];

  const shouldSkip = (dirPath: string) => {
    const base = path.basename(dirPath);
    if (excluded.has(base)) return true;
    if (resolvedTemplatesDir && dirPath.startsWith(resolvedTemplatesDir)) return true;
    return false;
  };

  const walk = (dirPath: string) => {
    if (shouldSkip(dirPath)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".workflow.json")) {
        foundTemplates.push(fullPath);
      }
    }
  };

  walk(repoRoot);

  if (foundTemplates.length > 0) {
    violations.push(`Found workflow templates in repo: ${foundTemplates.join(", ")}`);
  }

  if (violations.length > 0) {
    const message = `[startup] Workflow template policy violation: ${violations.join(" | ")}`;
    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    }
    console.warn(message);
  }
};

assertNoLocalWorkflowTemplates();

prisma
  .$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "_prisma_migrations"`)
  .then((rows: Array<{ count: number }>) => {
    const count = Array.isArray(rows) && rows[0] ? Number(rows[0].count) : 0;
    console.log(`[startup] Prisma migrations applied: ${count}`);
  })
  .catch((err) => {
    console.warn("[startup] Unable to read Prisma migrations table.", err);
  });
app.use(express.json());

app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", meRouter);
app.use("/api", brandsRouter);
app.use("/api", zealyRouter);
app.use("/api", systemRouter);
app.use("/api", traitsRouter);
app.use("/api", workflowsRouter);
app.use("/api", billingRouter);
app.use("/api", internalRouter);
if (process.env.NODE_ENV !== "production") {
  app.use("/api", devRouter);
}
app.use("/", metadataRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // TODO: Add structured logging once an observability stack exists.
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startKrnlRunPoller();
  startZealyAutomationWorkers();
});

export { app };
