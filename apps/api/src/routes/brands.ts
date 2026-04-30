import { Prisma } from "@prisma/client";
import { getAddress } from "ethers";
import { Request, Response, Router } from "express";
import multer from "multer";
import { prisma } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import {
  pollUntilTxHash,
  submitLootboxWorkflow,
  submitMintWorkflow,
  submitWorkflowToKrnl
} from "../services/krnlService";
import { encodeLootboxAuthData } from "../services/authDataEncoder";
import { fetchQuests, syncZealyQuests, ZealyApiError, ZealyConfigError } from "../services/zealyService";
import { getPublicUrl, uploadObject } from "../services/s3Service";
import { decodeB64Json, encodeB64Json } from "../services/x402Codec";
import { upsertTokenRecord } from "../services/tokenService";
import { requireBrandPortal } from "../middleware/requirePortal";
import {
  normalizeNonNegativeInt,
  normalizeXpMode,
  resolveXpOverride
} from "../services/rewardRulePolicy";
import { normalizeLootTableEntries } from "../services/lootboxSamplingService";

interface CreateBrandBody {
  name?: string;
  description?: string;
  logoUrl?: string;
  primaryChainId?: number;
}

interface ConnectZealyBody {
  communityId?: string;
  subdomain?: string;
  apiKey?: string;
  webhookSecret?: string;
}

interface BillingStartBody {
  amount?: number;
}

interface LootboxOpenBody {
  tokenId?: string;
}

interface NftContractBody {
  contractAddress?: string;
  chainId?: number | string;
  rpcUrl?: string;
  activeAssetPackId?: string;
}

interface AssetPackBody {
  name?: string;
  description?: string;
}

interface RewardRuleBody {
  xpDelta?: number;
  lootKeysDelta?: number;
  assetPackId?: string;
  enabled?: boolean;
  label?: string | null;
  xpMode?: "ZEALY" | "OVERRIDE" | "NONE" | string;
  xpOverride?: number | null;
  traitUpdates?: Array<{ key?: string; value?: string; traitKey?: string; traitValue?: string }>;
}

interface LootboxEntryBody {
  traitKey?: string;
  traitName?: string;
  traitValue?: string;
  weight?: number | string;
}

interface LootboxConfigBody {
  enabled?: boolean;
  xpPerKey?: number | string;
  xpPerLootKey?: number | string;
  lootKeysPerOpen?: number | string;
  xpCost?: number | string;
  maxUnlocksPerOpen?: number | string;
  lootTable?: {
    entries?: LootboxEntryBody[];
  };
}

const X402_VERSION = 2;
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const X402_USDC_DECIMALS = 6;
const X402_NETWORK = "eip155:84532";
const X402_MAX_TOPUP_USDC = 100;
const X402_BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const KRNL_DELEGATION_STATUSES = new Set([
  "not_started",
  "submitted",
  "confirmed",
  "failed"
]);

const getIntentInputs = (req: Request) => {
  const body = (req.body || {}) as Record<string, any>;
  const userSignature =
    body.userSignature ||
    body.intentSignature ||
    body.transactionIntentSignature ||
    req.header("x-user-signature") ||
    req.header("x-transaction-intent-signature");
  const transactionIntentId = body.transactionIntentId;
  const transactionIntentDeadline = body.transactionIntentDeadline;
  const transactionIntentDelegate = body.transactionIntentDelegate || body.delegate;
  return {
    userSignature: typeof userSignature === "string" ? userSignature : undefined,
    transactionIntentId:
      typeof transactionIntentId === "string" ? transactionIntentId : undefined,
    transactionIntentDeadline:
      typeof transactionIntentDeadline === "number" ? transactionIntentDeadline : undefined,
    transactionIntentDelegate:
      typeof transactionIntentDelegate === "string" ? transactionIntentDelegate : undefined
  };
};

const requireUserSignature = (req: Request, res: Response) => {
  const intent = getIntentInputs(req);
  if (!intent.userSignature || intent.userSignature === "0x") {
    res.status(400).json({ error: "missing_user_signature" });
    return null;
  }
  return intent;
};

type X402Accepted = {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
};

type X402PaymentPayload = {
  x402Version: number;
  accepted: X402Accepted;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
};

function buildPaymentRequirements(args: {
  amount: number;
  brandId: string;
  baseUrl: string;
}): {
  paymentRequirements: X402Accepted;
  amountAtomic: number;
  amountHuman: string;
} {
  const payTo =
    process.env.X402_PAY_TO_ADDRESS || process.env.KRNL_SENDER_ADDRESS;
  if (!payTo) {
    throw new Error("X402_PAY_TO_ADDRESS or KRNL_SENDER_ADDRESS must be set");
  }

  const amountHuman = args.amount.toString();
  const amountAtomic = Math.round(args.amount * 10 ** X402_USDC_DECIMALS);
  if (!Number.isSafeInteger(amountAtomic) || amountAtomic <= 0) {
    throw new Error("Invalid amount for USDC precision");
  }
  const resource = `${args.baseUrl}/api/brands/${args.brandId}/billing/x402/start`;

  const paymentRequirements: X402Accepted = {
    scheme: "exact",
    network: X402_NETWORK,
    maxAmountRequired: amountAtomic.toString(),
    resource,
    description: "Top up sponsorship credits",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 600,
    asset: X402_BASE_SEPOLIA_USDC,
    extra: {
      assetTransferMethod: "eip3009",
      name: "USDC",
      version: "2",
      decimals: X402_USDC_DECIMALS,
      unit: "human"
    }
  };

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[x402] accepts.extra: ${JSON.stringify(paymentRequirements.extra ?? {})}`
    );
  }

  return { paymentRequirements, amountAtomic, amountHuman };
}

type InvalidPaymentReason =
  | "bad_signature_format"
  | "network_mismatch"
  | "resource_mismatch"
  | "asset_mismatch"
  | "payto_mismatch"
  | "amount_mismatch"
  | "expired"
  | "verification_failed";


const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const uploadSingle = (fieldName: string) => {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        const message =
          err instanceof multer.MulterError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Upload failed";
        return res.status(400).json({ error: message });
      }
      return next();
    });
  };
};

const decimalToNumber = (value: Prisma.Decimal | number | null | undefined): number =>
  value === null || value === undefined ? 0 : new Prisma.Decimal(value).toNumber();

const resolveLogoUrl = (logoUrl?: string | null): string | null => {
  if (!logoUrl) return null;
  if (/^https?:\/\//i.test(logoUrl)) {
    return logoUrl;
  }
  return getPublicUrl(logoUrl);
};

const parseLootTableEntries = (lootTable: Prisma.JsonValue | undefined | null) =>
  normalizeLootTableEntries(lootTable);

const ensureUser = async (privyId: string, wallet?: string | null) => {
  return prisma.user.upsert({
    where: { privyId },
    update: wallet ? { wallet } : {},
    create: { privyId, wallet }
  });
};

router.use("/brands/:brandId", requireAuth, requireBrandPortal);


router.post(
  "/brands",
  requireAuth,
  requireBrandPortal,
  uploadSingle("logo"),
  async (req: Request<unknown, unknown, CreateBrandBody>, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, description, logoUrl } = req.body || {};
    const primaryChainIdRaw = (req.body as { primaryChainId?: string | number | null })
      ?.primaryChainId;
    const parsedChainId =
      primaryChainIdRaw !== undefined &&
      primaryChainIdRaw !== null &&
      String(primaryChainIdRaw).trim() !== ""
        ? Number(primaryChainIdRaw)
        : undefined;
    const file = req.file;

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);

      const brand = await prisma.brand.create({
        data: {
          ownerUserId: auth.privyUserId,
          name: name ?? "New Brand",
          description: description ?? "New brand description",
          logoUrl: logoUrl ?? "https://example.com/logo.png",
          primaryChainId: parsedChainId ?? 8453
        }
      });
      console.log(
        `[brands.create] userId=${auth.privyUserId} wallet=${auth.walletAddress ?? "null"} createdBrandId=${brand.id}`
      );

      let resolvedBrand = brand;
      if (file) {
        const objectKey = `brands/${brand.id}/logo/${file.originalname}`;
        await uploadObject({
          key: objectKey,
          body: file.buffer,
          contentType: file.mimetype
        });
        resolvedBrand = await prisma.brand.update({
          where: { id: brand.id },
          data: { logoUrl: objectKey }
        });
      }

      res.status(201).json({
        id: resolvedBrand.id,
        name: resolvedBrand.name,
        description: resolvedBrand.description,
        logoUrl: resolveLogoUrl(resolvedBrand.logoUrl),
        primaryChainId: resolvedBrand.primaryChainId,
        hasZealyConfig: resolvedBrand.hasZealyConfig,
        sponsorshipCredits: decimalToNumber(resolvedBrand.sponsorshipCredits)
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Internal server error";
      if (message.includes("Rendered workflow")) {
        return res.status(500).json({ error: message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get("/brands", requireAuth, requireBrandPortal, async (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
    const wallet = auth.walletAddress ?? null;
    const portalType = req.portal?.portalType ?? null;
    const selectedBrandId = req.portal?.brandId ?? null;

    console.log(
      `[brands.list] userId=${auth.privyUserId} wallet=${wallet ?? "null"} portal=${portalType ?? "null"} brandId=${selectedBrandId ?? "null"}`
    );

    if (wallet) {
      const legacyCount = await prisma.brand.count({
        where: { ownerUserId: wallet }
      });
      if (legacyCount > 0) {
        await prisma.brand.updateMany({
          where: { ownerUserId: wallet },
          data: { ownerUserId: auth.privyUserId }
        });
      }
    }

    const brands = await prisma.brand.findMany({
      where: { ownerUserId: auth.privyUserId },
      orderBy: { createdAt: "desc" }
    });

      res.json(
        brands.map((brand) => ({
          id: brand.id,
          name: brand.name,
          description: brand.description,
          logoUrl: resolveLogoUrl(brand.logoUrl),
          primaryChainId: brand.primaryChainId,
          hasZealyConfig: brand.hasZealyConfig
        }))
      );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/brands/me", requireAuth, requireBrandPortal, async (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
    const wallet = auth.walletAddress ?? null;
    if (wallet) {
      const legacyCount = await prisma.brand.count({
        where: { ownerUserId: wallet }
      });
      if (legacyCount > 0) {
        await prisma.brand.updateMany({
          where: { ownerUserId: wallet },
          data: { ownerUserId: auth.privyUserId }
        });
      }
    }
    const brands = await prisma.brand.findMany({
      where: { ownerUserId: auth.privyUserId },
      orderBy: { createdAt: "desc" }
    });
    res.json(
      brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        logoUrl: resolveLogoUrl(brand.logoUrl),
        primaryChainId: brand.primaryChainId,
        hasZealyConfig: brand.hasZealyConfig
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/brands/:brandId", requireAuth, async (req: Request, res: Response) => {
  const { brandId } = req.params;
  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return res.status(404).json({ error: "Brand not found" });
    }
    if (brand.ownerUserId !== auth.privyUserId) {
      return res.status(403).json({ error: "Not authorized for this brand" });
    }
    const zealyConfig = await prisma.zealyConnection.findFirst({ where: { brandId } });

    res.json({
      id: brand.id,
      name: brand.name,
      description: brand.description,
      logoUrl: resolveLogoUrl(brand.logoUrl),
      primaryChainId: brand.primaryChainId,
      hasZealyConfig: brand.hasZealyConfig,
      zealySubdomain: zealyConfig?.communityId ?? null,
      credits: decimalToNumber(brand.sponsorshipCredits)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get(
  "/brands/:brandId/automation",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      res.json({
        brandId,
        automationWalletAddress: brand.automationWalletAddress ?? null,
        krnlSenderAddress: brand.krnlSenderAddress ?? null,
        krnlDelegationStatus: brand.krnlDelegationStatus ?? null,
        krnlDelegationTxHash: brand.krnlDelegationTxHash ?? null,
        krnlDelegationUpdatedAt: brand.krnlDelegationUpdatedAt ?? null
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("KRNL_SENDER_PRIVATE_KEY missing")
      ) {
        return res.status(500).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/automation",
  requireAuth,
  async (
    req: Request<
      { brandId: string },
      unknown,
      {
        automationWalletAddress?: string;
        krnlSenderAddress?: string;
        krnlDelegationStatus?: string;
        krnlDelegationTxHash?: string;
      }
    >,
    res: Response
  ) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const {
      automationWalletAddress,
      krnlSenderAddress,
      krnlDelegationStatus,
      krnlDelegationTxHash
    } = req.body || {};

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      let normalizedAutomation: string | null | undefined = undefined;
      if (automationWalletAddress !== undefined) {
        if (!automationWalletAddress) {
          normalizedAutomation = null;
        } else {
          try {
            normalizedAutomation = getAddress(automationWalletAddress);
          } catch {
            return res.status(400).json({ error: "Invalid automationWalletAddress" });
          }
        }
      }

      let normalizedSender: string | null | undefined = undefined;
      if (krnlSenderAddress !== undefined) {
        if (!krnlSenderAddress) {
          normalizedSender = null;
        } else {
          try {
            normalizedSender = getAddress(krnlSenderAddress);
          } catch {
            return res.status(400).json({ error: "Invalid krnlSenderAddress" });
          }
        }
      }

      if (
        krnlDelegationStatus &&
        !KRNL_DELEGATION_STATUSES.has(krnlDelegationStatus)
      ) {
        return res.status(400).json({ error: "Invalid krnlDelegationStatus" });
      }

      const updated = await prisma.brand.update({
        where: { id: brandId },
        data: {
          automationWalletAddress: normalizedAutomation ?? undefined,
          krnlSenderAddress: normalizedSender ?? undefined,
          krnlDelegationStatus: krnlDelegationStatus ?? undefined,
          krnlDelegationTxHash: krnlDelegationTxHash ?? undefined,
          krnlDelegationUpdatedAt: new Date()
        }
      });

      res.json({
        brandId,
        automationWalletAddress: updated.automationWalletAddress ?? null,
        krnlSenderAddress: updated.krnlSenderAddress ?? null,
        krnlDelegationStatus: updated.krnlDelegationStatus ?? null,
        krnlDelegationTxHash: updated.krnlDelegationTxHash ?? null,
        krnlDelegationUpdatedAt: updated.krnlDelegationUpdatedAt ?? null
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

const handleZealyConnect = async (
  req: Request<{ brandId: string }, unknown, ConnectZealyBody>,
  res: Response
) => {
  const { brandId } = req.params;
  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { apiKey, communityId, subdomain, webhookSecret } = req.body || {};
  const resolvedCommunity = communityId || subdomain;
  if (!apiKey || !resolvedCommunity) {
    return res.status(400).json({ error: "Invalid Zealy credentials" });
  }

  try {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return res.status(404).json({ error: "Brand not found" });
    }

    const user = await ensureUser(auth.privyUserId, auth.walletAddress);
    if (brand.ownerUserId !== auth.privyUserId) {
      return res.status(403).json({ error: "Not authorized for this brand" });
    }

    try {
      await fetchQuests({ subdomain: resolvedCommunity, apiKey });
    } catch {
      return res.status(400).json({ error: "Invalid Zealy API key" });
    }

    await prisma.$transaction([
      prisma.brandZealyConfig.upsert({
        where: { brandId },
        update: {
          zealySubdomain: resolvedCommunity,
          zealyApiKeyEnc: apiKey, // TODO: encrypt API keys before storing
          zealyWebhookSecret: webhookSecret
        },
        create: {
          brandId,
          zealySubdomain: resolvedCommunity,
          zealyApiKeyEnc: apiKey, // TODO: encrypt API keys before storing
          zealyWebhookSecret: webhookSecret
        }
      }),
      prisma.zealyConnection.upsert({
        where: {
          brandId_communityId: {
            brandId,
            communityId: resolvedCommunity
          }
        },
        update: {
          apiKey: apiKey,
          webhookSecret: webhookSecret ?? null
        },
        create: {
          brandId,
          communityId: resolvedCommunity,
          apiKey: apiKey,
          webhookSecret: webhookSecret ?? null
        }
      }),
      prisma.brand.update({
        where: { id: brandId },
        data: { hasZealyConfig: true }
      })
    ]);

    await syncZealyQuests(brandId);

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/brands/:brandId/zealy", requireAuth, handleZealyConnect);
router.post("/brands/:brandId/zealy/connect", requireAuth, handleZealyConnect);

const handleZealySync = async (
  req: Request<{ brandId: string }>,
  res: Response
) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }
      const count = await syncZealyQuests(brandId);
      res.json({ ok: true, synced: count });
    } catch (error) {
      if (error instanceof ZealyConfigError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof ZealyApiError) {
        return res.status(502).json({ error: "Zealy sync failed" });
      }
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

router.post("/brands/:brandId/zealy/sync", requireAuth, handleZealySync);
router.post("/brands/:brandId/zealy/sync-quests", requireAuth, handleZealySync);


router.post(
  "/brands/:brandId/join",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    try {
      const intent = requireUserSignature(req, res);
      if (!intent) return;
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }
      if (!brand.hasZealyConfig) {
        return res.status(400).json({ error: "Brand has no Zealy configuration" });
      }
      if (decimalToNumber(brand.sponsorshipCredits) <= 0) {
        return res.status(402).json({ error: "Insufficient sponsorship credits" });
      }

      const user = await ensureUser(auth.privyUserId, walletAddress);

      const workflow = await submitMintWorkflow({
        brandId,
        walletAddress,
        transactionIntentDelegate: intent.transactionIntentDelegate,
        transactionIntentId: intent.transactionIntentId,
        transactionIntentDeadline: intent.transactionIntentDeadline,
        userSignature: intent.userSignature
      });

      await prisma.brand.update({
        where: { id: brandId },
        data: { sponsorshipCredits: new Prisma.Decimal(brand.sponsorshipCredits).minus(1) }
      });

      const membershipCount = await prisma.brandMembership.count({ where: { brandId } });
      const tokenId = String(membershipCount + 1);

      await prisma.brandMembership.create({
        data: {
          brandId,
          userId: auth.privyUserId,
          wallet: walletAddress,
          tokenId,
          role: "evolving"
        }
      });
      await upsertTokenRecord({
        tokenId,
        brandId,
        ownerAddress: walletAddress
      });

      res.json({
        brandId,
        walletAddress,
        tokenId,
        status: "joined"
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/memberships/me",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      await ensureUser(auth.privyUserId, walletAddress);
      await prisma.brandUser.upsert({
        where: { brandId_walletAddress: { brandId, walletAddress } },
        update: {},
        create: { brandId, walletAddress }
      });

      await prisma.brandUser.upsert({
        where: { brandId_walletAddress: { brandId, walletAddress } },
        update: {},
        create: { brandId, walletAddress }
      });

      const memberships = await prisma.brandMembership.findMany({
        where: { brandId, wallet: walletAddress }
      });

      res.json({
        brandId,
        walletAddress,
        tokens: memberships.map((m) => ({ tokenId: m.tokenId }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/quests",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const brandQuests = await prisma.zealyQuest.findMany({
        where: { brandId },
        orderBy: { updatedAt: "desc" }
      });

      res.json({
        quests: brandQuests.map((quest) => ({
          id: quest.zealyQuestId,
          zealyQuestId: quest.zealyQuestId,
          title: quest.title,
          description: quest.description,
          xp: quest.xp ?? null,
          xpReward: quest.xp ?? null,
          status: quest.status ?? null,
          updatedAt: quest.updatedAt
        }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/lootbox/config",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const config = await prisma.lootboxConfig.findUnique({ where: { brandId } });
      const entries = parseLootTableEntries(config?.lootTable);
      const xpPerKey = config?.xpPerLootKey ?? config?.xpCost ?? 100;

      return res.json({
        brandId,
        enabled: config?.enabled ?? true,
        xpPerKey,
        xpPerLootKey: xpPerKey,
        lootKeysPerOpen: config?.lootKeysPerOpen ?? 1,
        xpCost: xpPerKey,
        maxUnlocksPerOpen: config?.maxUnlocksPerOpen ?? 1,
        lootTable: {
          entries: entries.map((entry) => ({
            traitKey: entry.traitName,
            traitName: entry.traitName,
            traitValue: entry.traitValue,
            weight: entry.weight
          }))
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/lootbox/config",
  requireAuth,
  async (
    req: Request<{ brandId: string }, unknown, LootboxConfigBody>,
    res: Response
  ) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const enabled = req.body?.enabled ?? true;
    const parsedXpPerLootKey = Number(
      req.body?.xpPerKey ?? req.body?.xpPerLootKey ?? req.body?.xpCost ?? 100
    );
    const parsedLootKeysPerOpen = Number(req.body?.lootKeysPerOpen ?? 1);
    const parsedMaxUnlocksPerOpen = Number(req.body?.maxUnlocksPerOpen ?? 1);
    const entriesRaw = Array.isArray(req.body?.lootTable)
      ? req.body?.lootTable
      : Array.isArray(req.body?.lootTable?.entries)
      ? req.body?.lootTable?.entries
      : [];
    const entries = entriesRaw.map((entry) => ({
      traitName: String(entry?.traitName ?? entry?.traitKey ?? "").trim(),
      traitValue: String(entry?.traitValue ?? "").trim(),
      weight: Number(entry?.weight)
    }));

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be boolean" });
    }
    if (
      !Number.isFinite(parsedXpPerLootKey) ||
      !Number.isInteger(parsedXpPerLootKey) ||
      parsedXpPerLootKey < 1
    ) {
      return res.status(400).json({ error: "xpPerLootKey must be >= 1" });
    }
    if (
      !Number.isFinite(parsedLootKeysPerOpen) ||
      !Number.isInteger(parsedLootKeysPerOpen) ||
      parsedLootKeysPerOpen < 1
    ) {
      return res.status(400).json({ error: "lootKeysPerOpen must be >= 1" });
    }
    if (
      !Number.isFinite(parsedMaxUnlocksPerOpen) ||
      !Number.isInteger(parsedMaxUnlocksPerOpen) ||
      parsedMaxUnlocksPerOpen < 1
    ) {
      return res.status(400).json({ error: "maxUnlocksPerOpen must be >= 1" });
    }
    if (enabled && entries.length === 0) {
      return res.status(400).json({ error: "lootTable.entries must be non-empty when enabled" });
    }
    for (const entry of entries) {
      if (!entry.traitName || !entry.traitValue) {
        return res
          .status(400)
          .json({ error: "Each loot table entry needs traitName/traitKey and traitValue" });
      }
      if (!Number.isFinite(entry.weight) || !Number.isInteger(entry.weight) || entry.weight < 1) {
        return res.status(400).json({ error: "Each loot table entry weight must be >= 1" });
      }
    }

    try {
      await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      if (enabled && entries.length > 0) {
        const nftConfig = await prisma.brandNftConfig.findUnique({ where: { brandId } });
        const activeAssetPackId = nftConfig?.activeAssetPackId ?? null;
        if (!activeAssetPackId) {
          return res.status(400).json({
            error: "Active asset pack is required. Set activeAssetPackId in NFT contract config."
          });
        }

        const stateKeys = Array.from(
          new Set(entries.map((entry) => `${entry.traitName}:${entry.traitValue}`))
        );
        const availableLayers = await prisma.nftAssetObject.findMany({
          where: {
            brandId,
            assetPackId: activeAssetPackId,
            kind: { in: ["layer", "state"] },
            stateKey: { in: stateKeys }
          },
          select: { stateKey: true }
        });
        const availableKeySet = new Set(
          availableLayers.map((layer) => String(layer.stateKey || ""))
        );
        const missingEntries = stateKeys.filter((stateKey) => !availableKeySet.has(stateKey));
        if (missingEntries.length > 0) {
          return res.status(400).json({
            error:
              "Loot table entries must have uploaded layer images in the active asset pack.",
            missingEntries
          });
        }
      }

      const config = await prisma.lootboxConfig.upsert({
        where: { brandId },
        update: {
          enabled,
          xpPerLootKey: parsedXpPerLootKey,
          lootKeysPerOpen: parsedLootKeysPerOpen,
          xpCost: parsedXpPerLootKey,
          maxUnlocksPerOpen: parsedMaxUnlocksPerOpen,
          lootTable: {
            entries
          } as Prisma.InputJsonValue
        },
        create: {
          brandId,
          enabled,
          xpPerLootKey: parsedXpPerLootKey,
          lootKeysPerOpen: parsedLootKeysPerOpen,
          xpCost: parsedXpPerLootKey,
          maxUnlocksPerOpen: parsedMaxUnlocksPerOpen,
          lootTable: {
            entries
          } as Prisma.InputJsonValue
        }
      });

      return res.json({
        ok: true,
        brandId,
        enabled: config.enabled,
        xpPerKey: config.xpPerLootKey,
        xpPerLootKey: config.xpPerLootKey,
        lootKeysPerOpen: config.lootKeysPerOpen,
        xpCost: config.xpPerLootKey,
        maxUnlocksPerOpen: config.maxUnlocksPerOpen,
        lootTable: {
          entries: parseLootTableEntries(config.lootTable).map((entry) => ({
            traitKey: entry.traitName,
            traitName: entry.traitName,
            traitValue: entry.traitValue,
            weight: entry.weight
          }))
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/quests/state",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }
      if (!brand.hasZealyConfig) {
        return res.status(400).json({ error: "Brand has no Zealy configuration" });
      }

      await ensureUser(auth.privyUserId, walletAddress);

      const [brandQuests, questStates] = await Promise.all([
        prisma.quest.findMany({ where: { brandId } }),
        prisma.userQuestState.findMany({
          where: { brandId, wallet: walletAddress }
        })
      ]);

      const stateByQuestId: Record<string, string> = questStates.reduce((acc: Record<string, string>, state) => {
        acc[state.questId] = state.status;
        return acc;
      }, {});

      const responseQuests = brandQuests.map((quest) => ({
        id: quest.id,
        zealyQuestId: quest.zealyQuestId,
        title: quest.title,
        description: quest.description,
        xpReward: quest.xpReward,
        active: quest.active,
        status: stateByQuestId[quest.id] ?? "not_started"
      }));

      res.json({ brandId, quests: responseQuests });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/nft/contract",
  requireAuth,
  async (req: Request<{ brandId: string }, unknown, NftContractBody>, res: Response) => {
    const { brandId } = req.params;
    const { contractAddress, chainId, rpcUrl, activeAssetPackId } = req.body || {};
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (!contractAddress || chainId === undefined || chainId === null || !rpcUrl) {
      return res.status(400).json({ error: "Missing NFT contract params" });
    }

    const chainIdInt = Number(chainId);
    if (!Number.isInteger(chainIdInt)) {
      return res.status(400).json({ error: "Invalid chainId" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (activeAssetPackId) {
        const pack = await prisma.nftAssetPack.findFirst({
          where: { id: activeAssetPackId, brandId }
        });
        if (!pack) {
          return res.status(400).json({ error: "Active asset pack not found for brand" });
        }
      }

      const updateData: Prisma.BrandNftConfigUpdateInput = {
        contractAddress,
        chainId: chainIdInt,
        rpcUrl
      };
      if (activeAssetPackId !== undefined) {
        updateData.activeAssetPack = activeAssetPackId
          ? { connect: { id: activeAssetPackId } }
          : { disconnect: true };
      }
      const createData: Prisma.BrandNftConfigCreateInput = {
        brand: { connect: { id: brandId } },
        contractAddress,
        chainId: chainIdInt,
        rpcUrl,
        ...(activeAssetPackId
          ? { activeAssetPack: { connect: { id: activeAssetPackId } } }
          : {})
      };

      await prisma.brandNftConfig.upsert({
        where: { brandId },
        update: updateData,
        create: createData
      });

      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/nft/contract",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const config = await prisma.brandNftConfig.findUnique({ where: { brandId } });
      if (!config) {
        return res.status(404).json({ error: "NFT config not found" });
      }
      if (!config.contractAddress) {
        return res.status(400).json({ error: "NFT contract address not configured" });
      }

      res.json({
        contractAddress: config.contractAddress,
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        activeAssetPackId: config.activeAssetPackId
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/contract",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const config = await prisma.brandNftConfig.findUnique({ where: { brandId } });
      if (!config) {
        return res.status(404).json({ error: "NFT config not found" });
      }

      res.json({
        chainId: config.chainId,
        contractAddress: config.contractAddress,
        baseUriOnchain: config.baseUriOnchain ?? null,
        baseUriExpected:
          process.env.GLOBAL_METADATA_BASE_URI ??
          process.env.METADATA_BASE_URL ??
          null
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/nft/asset-packs",
  requireAuth,
  async (req: Request<{ brandId: string }, unknown, AssetPackBody>, res: Response) => {
    const { brandId } = req.params;
    const { name, description } = req.body || {};
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const pack = await prisma.nftAssetPack.create({
        data: {
          brandId,
          name,
          description
        }
      });

      res.status(201).json({ id: pack.id, name: pack.name });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/nft/asset-packs",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const packs = await prisma.nftAssetPack.findMany({
        where: { brandId },
        orderBy: { createdAt: "desc" }
      });

      res.json({
        items: packs.map((pack) => ({
          id: pack.id,
          name: pack.name,
          baseImageUrl: pack.baseImageKey ? getPublicUrl(pack.baseImageKey) : null,
          previewImageUrl: pack.previewImageKey ? getPublicUrl(pack.previewImageKey) : null
        }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/nft/asset-packs/:packId/upload",
  requireAuth,
  uploadSingle("file"),
  async (
    req: Request<{ brandId: string; packId: string }, unknown, Record<string, string>>,
    res: Response
  ) => {
    const { brandId, packId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const kind = typeof req.body?.kind === "string" ? req.body.kind : undefined;
    const traitName = typeof req.body?.traitName === "string" ? req.body.traitName : undefined;
    const traitValue = typeof req.body?.traitValue === "string" ? req.body.traitValue : undefined;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "File is required" });
    }
    if (kind !== "base" && kind !== "state" && kind !== "layer") {
      return res.status(400).json({ error: "Invalid kind. Must be base, state, or layer" });
    }
    if ((kind === "state" || kind === "layer") && (!traitName || !traitValue)) {
      return res.status(400).json({ error: "traitName and traitValue are required for state uploads" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const pack = await prisma.nftAssetPack.findFirst({
        where: { id: packId, brandId }
      });
      if (!pack) {
        return res.status(404).json({ error: "Asset pack not found" });
      }

      const objectKey = `brands/${brandId}/packs/${packId}/${kind}/${file.originalname}`;
      await uploadObject({
        key: objectKey,
        body: file.buffer,
        contentType: file.mimetype
      });

      const assetObject = await prisma.nftAssetObject.create({
        data: {
          brandId,
          assetPackId: packId,
          objectKey,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          kind,
          stateKey: kind === "state" || kind === "layer" ? `${traitName}:${traitValue}` : null
        }
      });

      if (kind === "base") {
        await prisma.nftAssetPack.update({
          where: { id: packId },
          data: { baseImageKey: objectKey }
        });
      } else if (kind === "state") {
        const resolvedTraitName = traitName as string;
        const resolvedTraitValue = traitValue as string;
        await prisma.nftStateMapping.upsert({
          where: {
            assetPackId_traitName_traitValue: {
              assetPackId: packId,
              traitName: resolvedTraitName,
              traitValue: resolvedTraitValue
            }
          },
          update: {
            imageObjectId: assetObject.id
          },
          create: {
            brandId,
            assetPackId: packId,
            traitName: resolvedTraitName,
            traitValue: resolvedTraitValue,
            imageObjectId: assetObject.id
          }
        });
      }

      res.status(201).json({
        ok: true,
        objectKey,
        assetObjectId: assetObject.id
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/nft/asset-packs/:packId/assets",
  requireAuth,
  async (req: Request<{ brandId: string; packId: string }>, res: Response) => {
    const { brandId, packId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const pack = await prisma.nftAssetPack.findFirst({
        where: { id: packId, brandId }
      });
      if (!pack) {
        return res.status(404).json({ error: "Asset pack not found" });
      }

      const assets = await prisma.nftAssetObject.findMany({
        where: { brandId, assetPackId: packId },
        orderBy: { createdAt: "desc" }
      });

      res.json({
        items: assets.map((asset) => {
          const [traitName, traitValue] = asset.stateKey?.split(":") ?? [];
          return {
            id: asset.id,
            kind: asset.kind,
            traitName: traitName || null,
            traitValue: traitValue || null,
            objectKey: asset.objectKey,
            publicUrl: getPublicUrl(asset.objectKey)
          };
        })
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Legacy quest reward configuration endpoints. New owner economy uses Zealy XP + lootbox config.
router.post(
  "/brands/:brandId/quests/:questId/reward",
  requireAuth,
  async (req: Request<{ brandId: string; questId: string }, unknown, RewardRuleBody>, res: Response) => {
    const { brandId, questId } = req.params;
    const { lootKeysDelta, assetPackId, enabled, label, xpMode, xpOverride } = req.body || {};
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const zealyQuest = await prisma.zealyQuest.findFirst({
        where: { brandId, zealyQuestId: questId }
      });
      if (!zealyQuest) {
        return res.status(404).json({ error: "Quest not found" });
      }

      const effectiveEnabled = typeof enabled === "boolean" ? enabled : true;
      const effectiveLabel =
        label === null ? null : typeof label === "string" ? label.trim() || null : null;
      const effectiveLootKeysDelta =
        lootKeysDelta === undefined ? 0 : normalizeNonNegativeInt(lootKeysDelta);
      if (effectiveLootKeysDelta === null) {
        return res.status(400).json({ error: "lootKeysDelta must be >= 0" });
      }

      const normalizedXpMode = normalizeXpMode(xpMode);
      if (!normalizedXpMode) {
        return res
          .status(400)
          .json({ error: "xpMode must be one of ZEALY, OVERRIDE, NONE" });
      }

      const normalizedXpOverride = resolveXpOverride(normalizedXpMode, xpOverride);
      if (normalizedXpMode === "OVERRIDE" && normalizedXpOverride === null) {
        return res
          .status(400)
          .json({ error: "xpOverride must be present and >= 0 when xpMode is OVERRIDE" });
      }

      const rewardRule = await prisma.brandRewardRule.upsert({
        where: {
          brandId_questId: {
            brandId,
            questId: zealyQuest.zealyQuestId
          }
        },
        update: {
          enabled: effectiveEnabled,
          lootKeysDelta: effectiveLootKeysDelta,
          label: effectiveLabel,
          xpMode: normalizedXpMode,
          xpOverride: normalizedXpOverride
        },
        create: {
          brandId,
          questId: zealyQuest.zealyQuestId,
          enabled: effectiveEnabled,
          lootKeysDelta: effectiveLootKeysDelta,
          label: effectiveLabel,
          xpMode: normalizedXpMode,
          xpOverride: normalizedXpOverride
        }
      });

      const legacyRule = await prisma.brandQuestRewardRule.upsert({
        where: {
          brandId_zealyQuestId: {
            brandId,
            zealyQuestId: zealyQuest.zealyQuestId
          }
        },
        update: {
          lootKeyDelta: effectiveLootKeysDelta,
          assetPackId: assetPackId ?? null,
          enabled: effectiveEnabled
        },
        create: {
          brandId,
          zealyQuestId: zealyQuest.zealyQuestId,
          xpDelta: 0,
          lootKeyDelta: effectiveLootKeysDelta,
          assetPackId: assetPackId ?? null,
          enabled: effectiveEnabled
        }
      });

      res.json({
        ok: true,
        reward: {
          zealyQuestId: legacyRule.zealyQuestId,
          xpDelta: 0,
          lootKeysDelta: rewardRule.lootKeysDelta,
          assetPackId: legacyRule.assetPackId ?? null,
          enabled: rewardRule.enabled,
          label: rewardRule.label ?? null,
          xpMode: rewardRule.xpMode,
          xpOverride: rewardRule.xpOverride ?? null,
          traitUpdates: []
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/quests/:questId/reward",
  requireAuth,
  async (req: Request<{ brandId: string; questId: string }>, res: Response) => {
    const { brandId, questId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const reward = await prisma.brandQuestRewardRule.findFirst({
        where: { brandId, zealyQuestId: questId }
      });
      const newReward = await prisma.brandRewardRule.findFirst({
        where: { brandId, questId }
      });

      if (!reward && !newReward) {
        return res.json({ reward: null });
      }

      res.json({
        reward: {
          zealyQuestId: reward?.zealyQuestId ?? newReward?.questId ?? questId,
          xpDelta: 0,
          lootKeysDelta: newReward?.lootKeysDelta ?? reward?.lootKeyDelta ?? 0,
          assetPackId: reward?.assetPackId ?? null,
          enabled: newReward?.enabled ?? reward?.enabled ?? true,
          label: newReward?.label ?? null,
          xpMode: newReward?.xpMode ?? "ZEALY",
          xpOverride: newReward?.xpOverride ?? null,
          traitUpdates: []
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/lootbox/open",
  requireAuth,
  async (req: Request<{ brandId: string }, unknown, LootboxOpenBody>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    const { tokenId } = req.body || {};
    if (!walletAddress || !tokenId) {
      return res.status(400).json({ error: "Missing authentication headers or tokenId" });
    }

    try {
      const intent = requireUserSignature(req, res);
      if (!intent) return;
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      await ensureUser(auth.privyUserId, walletAddress);

      const membership = await prisma.brandMembership.findFirst({
        where: { brandId, wallet: walletAddress, tokenId }
      });
      if (!membership) {
        return res.status(400).json({ error: "Not eligible for lootbox" });
      }

      if (decimalToNumber(brand.sponsorshipCredits) <= 0) {
        return res.status(402).json({ error: "Insufficient sponsorship credits" });
      }

      const { authResultHex, authSignatureHex } = encodeLootboxAuthData({
        tokenId,
        traitUpdates: [] // TODO: fetch traits from chain and encode real lootbox result
      });

      const workflow = await submitLootboxWorkflow({
        brandId,
        walletAddress,
        tokenId,
        authResultHex,
        authSignatureHex,
        transactionIntentDelegate: intent.transactionIntentDelegate,
        transactionIntentId: intent.transactionIntentId,
        transactionIntentDeadline: intent.transactionIntentDeadline,
        userSignature: intent.userSignature
      });

      await prisma.brand.update({
        where: { id: brandId },
        data: {
          sponsorshipCredits: new Prisma.Decimal(brand.sponsorshipCredits).minus(0.5)
        }
      });

      // TODO: Trigger KRNL lootbox workflow and return updated on-chain traits.
      res.json({
        brandId,
        tokenId,
        updatedTraits: {
          XP: "1000",
          LEVEL: "3",
          RARITY: "2",
          LOOT_KEYS: "0"
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);


router.get(
  "/brands/:brandId/credits",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      const user = await prisma.user.findUnique({ where: { privyId: auth.privyUserId } });
      if (!user || brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      res.json({
        credits: decimalToNumber(brand.sponsorshipCredits)
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/billing/x402/start",
  requireAuth,
  async (req: Request<{ brandId: string }, unknown, BillingStartBody>, res: Response) => {
    const { brandId } = req.params;
    const { amount } = req.body || {};
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (amountNumber > X402_MAX_TOPUP_USDC) {
      return res.status(400).json({ error: "Amount too large" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      const user = await prisma.user.findUnique({ where: { privyId: auth.privyUserId } });
      if (!user || brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const baseUrl =
        process.env.PUBLIC_BASE_URL ||
        process.env.PUBLIC_API_BASE_URL ||
        `${req.protocol}://${req.get("host")}`;
      const { paymentRequirements, amountHuman } = buildPaymentRequirements({
        amount: amountNumber,
        brandId,
        baseUrl
      });
      const paymentRequiredPayload = {
        x402Version: X402_VERSION,
        accepts: [paymentRequirements]
      };

      const paymentHeader = req.header("payment-signature") || req.header("PAYMENT-SIGNATURE");

      if (!paymentHeader) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json(paymentRequiredPayload);
        return;
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[x402] payment-signature received length=${Buffer.byteLength(paymentHeader, "utf8")}`
        );
        console.log(
          `[x402] expected network=${paymentRequirements.network} asset=${paymentRequirements.asset} payTo=${paymentRequirements.payTo} amountAtomic=${paymentRequirements.maxAmountRequired}`
        );
      }

      let paymentPayload: X402PaymentPayload;
      try {
        paymentPayload = decodeB64Json<X402PaymentPayload>(paymentHeader);
      } catch (error) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "bad_signature_format" });
        return;
      }

      if (process.env.NODE_ENV !== "production") {
        const summary = {
          keys: Object.keys(paymentPayload ?? {}),
          network: paymentPayload?.accepted?.network,
          chainId: (paymentPayload as any)?.chainId,
          resource: paymentPayload?.accepted?.resource,
          payTo: paymentPayload?.accepted?.payTo,
          asset: paymentPayload?.accepted?.asset,
          amount: paymentPayload?.accepted?.maxAmountRequired,
          validAfter: paymentPayload?.payload?.authorization?.validAfter,
          validBefore: paymentPayload?.payload?.authorization?.validBefore,
          signatureLength: paymentPayload?.payload?.signature?.length
        };
        console.log(`[x402] decoded summary: ${JSON.stringify(summary)}`);
        const sig = paymentPayload?.payload?.signature || "";
        console.log(`[x402] accepted.network=${paymentPayload?.accepted?.network} signature=${sig.slice(0, 10)}`);
      }

      if (paymentPayload.x402Version !== X402_VERSION) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "bad_signature_format" });
        return;
      }
      if (paymentPayload.accepted?.scheme !== paymentRequirements.scheme) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "bad_signature_format" });
        return;
      }
      if (paymentPayload.accepted?.network !== paymentRequirements.network) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "invalid_payment", reason: "network_mismatch" });
        return;
      }

      if (paymentPayload.accepted?.resource !== paymentRequirements.resource) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "invalid_payment", reason: "resource_mismatch" });
        return;
      }

      if (paymentPayload.accepted?.asset?.toLowerCase() !== paymentRequirements.asset.toLowerCase()) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "invalid_payment", reason: "asset_mismatch" });
        return;
      }

      const authorization = paymentPayload.payload?.authorization;
      if (!authorization) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "bad_signature_format" });
        return;
      }

      if (
        authorization.to?.toLowerCase() !== paymentRequirements.payTo.toLowerCase()
      ) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "invalid_payment", reason: "payto_mismatch" });
        return;
      }
      if (authorization.value !== paymentRequirements.maxAmountRequired) {
        const details =
          process.env.NODE_ENV !== "production"
            ? {
                expectedAtomic: paymentRequirements.maxAmountRequired,
                receivedAtomic: authorization.value
              }
            : undefined;
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "invalid_payment", reason: "amount_mismatch", ...(details && { details }) });
        return;
      }
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      if (authorization.validAfter && BigInt(authorization.validAfter) > nowSec) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "invalid_payment", reason: "expired" });
        return;
      }
      if (authorization.validBefore && BigInt(authorization.validBefore) <= nowSec) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "invalid_payment", reason: "expired" });
        return;
      }

      const signature = paymentPayload.payload.signature;
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature || "")) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "bad_signature_format" });
        return;
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce || "")) {
        res
          .status(402)
          .set("PAYMENT-REQUIRED", encodeB64Json(paymentRequiredPayload))
          .json({ error: "bad_signature_format" });
        return;
      }

      if (process.env.NODE_ENV === "production") {
        res.status(501).json({ error: "facilitator_not_configured" });
        return;
      }

      const externalRef = paymentHeader;
      const { payment, updatedBrand } = await prisma.$transaction(async (tx) => {
        const createdPayment = await tx.payment.create({
          data: {
            brandId,
            amount: new Prisma.Decimal(amountNumber),
            externalRef,
            status: "completed"
          }
        });
        const brandUpdate = await tx.brand.update({
          where: { id: brandId },
          data: {
            sponsorshipCredits: {
              increment: new Prisma.Decimal(amountNumber)
            }
          }
        });
        return { payment: createdPayment, updatedBrand: brandUpdate };
      });

      res.json({
        ok: true,
        credits: decimalToNumber(updatedBrand.sponsorshipCredits),
        paymentId: payment.id
      });
      if (process.env.NODE_ENV !== "production") {
        console.log("[x402] payment_verified");
        console.log(`[x402] credits_updated=${decimalToNumber(updatedBrand.sponsorshipCredits)}`);
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/actions",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const actions = await prisma.actionQueueItem.findMany({
        where: { brandId },
        orderBy: { createdAt: "desc" }
      });

      res.json({
        items: actions.map((item) => ({
          id: item.id,
          actionType: item.actionType,
          status: item.status,
          walletAddress: item.walletAddress,
          tokenId: item.tokenId ?? null,
          attempts: item.attempts,
          lastError: item.lastError ?? null,
          payload: item.payloadJson,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/workflows",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const runs = await prisma.workflowRun.findMany({
        where: {
          OR: [{ brandId }, { scopeType: "PLATFORM" }]
        },
        orderBy: { createdAt: "desc" }
      });

      res.json(
        runs
          .filter((run) => !!run.id)
          .map((run) => ({
            id: run.id,
            type: run.type,
            workflowName: run.workflowName ?? null,
            status: run.status,
            scopeType: run.scopeType,
            scopeId: run.scopeId,
            wallet: run.wallet,
            tokenId: run.tokenId,
            actionQueueItemId: run.actionQueueItemId ?? null,
            requestId: run.requestId ?? null,
            intentId: run.txIntentId ?? run.intentId ?? null,
            txIntentId: run.txIntentId ?? null,
            krnlRequestId: run.requestId ?? null,
            krnlIntentId: run.intentId ?? null,
            krnlExecutionHash: run.krnlExecutionHash ?? null,
            chainTxHash: run.chainTxHash ?? null,
            txHash: run.txHash ?? null,
            stepsJson: run.stepsJson ?? null,
            error: run.error ?? null,
            lastStatusPayloadJson: run.stepsJson ?? null,
            errorMessage: run.error ?? null,
            createdAt: run.createdAt,
            retryCount: run.retryCount,
            lastRetriedAt: run.lastRetriedAt
          }))
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/brands/:brandId/workflows/:runId",
  requireAuth,
  async (req: Request<{ brandId: string; runId: string }>, res: Response) => {
    const { brandId, runId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      if (!runId || runId === "undefined") {
        return res.status(400).json({ error: "invalid runId" });
      }
      if (!isUuid(runId)) {
        return res.status(400).json({ error: "invalid runId" });
      }

      const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!run || (run.scopeType !== "PLATFORM" && run.brandId !== brandId)) {
        return res.status(404).json({ error: "Workflow run not found" });
      }

      res.json({
        id: run.id,
        type: run.type,
        workflowName: run.workflowName ?? null,
        status: run.status,
        scopeType: run.scopeType,
        scopeId: run.scopeId,
        wallet: run.wallet,
        tokenId: run.tokenId,
        zealyQuestId: run.zealyQuestId,
        questId: run.questId,
        actionQueueItemId: run.actionQueueItemId ?? null,
        requestId: run.requestId ?? null,
        intentId: run.txIntentId ?? run.intentId ?? null,
        txIntentId: run.txIntentId ?? null,
        krnlRequestId: run.requestId ?? null,
        krnlIntentId: run.intentId ?? null,
        krnlExecutionHash: run.krnlExecutionHash ?? null,
        chainTxHash: run.chainTxHash ?? null,
        txHash: run.txHash ?? null,
        stepsJson: run.stepsJson ?? null,
        error: run.error ?? null,
        lastStatusPayloadJson: run.stepsJson ?? null,
        errorMessage: run.error ?? null,
        renderedWorkflowJson: run.renderedWorkflowJson,
        retryCount: run.retryCount,
        lastRetriedAt: run.lastRetriedAt
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/workflows/:runId/poll",
  requireAuth,
  async (req: Request<{ brandId: string; runId: string }>, res: Response) => {
    const { brandId, runId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!run || (run.scopeType !== "PLATFORM" && run.brandId !== brandId)) {
        return res.status(404).json({ error: "Workflow run not found" });
      }

      const pollResult = await pollUntilTxHash(runId);
      res.json(pollResult);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/brands/:brandId/workflows/:runId/retry",
  requireAuth,
  async (req: Request<{ brandId: string; runId: string }>, res: Response) => {
    const { brandId, runId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!run || (run.scopeType !== "PLATFORM" && run.brandId !== brandId)) {
        return res.status(404).json({ error: "Workflow run not found" });
      }

      if (!["failed"].includes(run.status)) {
        return res.status(400).json({ error: "Workflow run is not failed" });
      }

      if (!run.renderedWorkflowJson) {
        return res.status(400).json({ error: "Workflow run has no rendered workflow" });
      }

      if (run.type === "QUEST_REWARD") {
        const zealyEvent = await prisma.zealyEvent.findFirst({
          where: { workflowRunId: run.id }
        });
        if (zealyEvent?.status === "completed") {
          return res.status(409).json({ error: "Quest reward already completed" });
        }
      } else if (run.type === "MINT_BASE_NFT") {
        const existing = await prisma.brandMembership.findFirst({
          where: { brandId, wallet: run.wallet, role: "evolving" }
        });
        if (existing) {
          return res.status(409).json({ error: "Membership already exists" });
        }
      } else if (run.type === "OPEN_LOOTBOX") {
        // Allow retry for MVP.
      } else {
        return res.status(400).json({ error: "Unsupported workflow type" });
      }

      const submission = await submitWorkflowToKrnl(run.renderedWorkflowJson);
      let renderedWorkflowJson = run.renderedWorkflowJson as unknown;
      if (renderedWorkflowJson && typeof renderedWorkflowJson === "object" && !Array.isArray(renderedWorkflowJson)) {
        const record = renderedWorkflowJson as Record<string, any>;
        const metadata =
          record.metadata && typeof record.metadata === "object" ? record.metadata : {};
        renderedWorkflowJson = {
          ...record,
          metadata: {
            ...(metadata as Record<string, any>),
            krnlSubmitMethod: submission.krnlMethod
          }
        };
      }

      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "queued",
          krnlRunRef:
            submission.requestId ??
            submission.krnlIntentId ??
            submission.txIntentId ??
            null,
          txIntentId: submission.txIntentId ?? null,
          requestId: submission.requestId,
          intentId: submission.krnlIntentId ?? null,
          txHash: null,
          error: null,
          retryCount: { increment: 1 },
          lastRetriedAt: new Date(),
          ...(renderedWorkflowJson
            ? { renderedWorkflowJson: renderedWorkflowJson as Prisma.InputJsonValue }
            : {})
        }
      });

      res.json({
        ok: true,
        runId: run.id,
        requestId: submission.requestId ?? null,
        intentId: submission.txIntentId ?? null,
        txIntentId: submission.txIntentId ?? null,
        krnlIntentId: submission.krnlIntentId ?? null
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
