import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwnerPortal } from "../middleware/requirePortal";
import { ensureBaseNftMinted } from "../services/nftService";
import { getPublicUrl } from "../services/s3Service";
import {
  submitLootboxWorkflow,
  submitSetActiveTraitsWorkflow
} from "../services/krnlService";
import { encodeLootboxAuthData } from "../services/authDataEncoder";
import {
  calculatePurchaseXpRequired,
  calculateXpAvailable,
  resolveDefaultXpPerLootKey
} from "../services/lootboxEconomyService";
import {
  normalizeLootTableEntries,
  sampleWeightedLootEntries
} from "../services/lootboxSamplingService";

const router = Router();
const DEMO_DEFAULT_XP = 10000;
const DEMO_MODE = String(process.env.DEMO_MODE || "").toLowerCase() === "true";
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const ensureUser = async (privyId: string, wallet?: string | null) => {
  return prisma.user.upsert({
    where: { privyId },
    update: wallet ? { wallet } : {},
    create: { privyId, wallet }
  });
};

const resolveLogoUrl = (logoUrl?: string | null): string | null => {
  if (!logoUrl) return null;
  if (/^https?:\/\//i.test(logoUrl)) {
    return logoUrl;
  }
  return getPublicUrl(logoUrl);
};

const splitStateKey = (value?: string | null): { traitName: string; traitValue: string } | null => {
  if (!value) return null;
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) return null;
  const traitName = value.slice(0, separatorIndex).trim();
  const traitValue = value.slice(separatorIndex + 1).trim();
  if (!traitName || !traitValue) return null;
  return { traitName, traitValue };
};

const getOrCreateEconomyLedger = async (brandId: string, walletAddress: string) => {
  const existing = await prisma.userBrandEconomyLedger.findUnique({
    where: { brandId_wallet: { brandId, wallet: walletAddress } }
  });
  if (existing) {
    if (existing.zealyXpTotal > 0) return existing;
    return prisma.userBrandEconomyLedger.update({
      where: { brandId_wallet: { brandId, wallet: walletAddress } },
      data: { zealyXpTotal: DEMO_DEFAULT_XP }
    });
  }
  return prisma.userBrandEconomyLedger.create({
    data: {
      brandId,
      wallet: walletAddress,
      zealyXpTotal: DEMO_DEFAULT_XP,
      xpSpent: 0,
      lootKeysBalance: 0
    }
  });
};

router.get(
  "/me/brands",
  requireAuth,
  requireOwnerPortal,
  async (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    try {
      const scope = String(req.query.scope || "").trim().toLowerCase();
      const joinedOnly = scope === "joined";

      const [brands, memberships, ownerships, ledgers, zealyConnections] = await Promise.all([
        prisma.brand.findMany({
          orderBy: { createdAt: "desc" }
        }),
        prisma.brandMembership.findMany({
          where: { wallet: walletAddress },
          select: { brandId: true, tokenId: true }
        }),
        prisma.tokenOwnership.findMany({
          where: { walletAddress },
          select: { brandId: true, tokenId: true }
        }),
        prisma.brandUserLedger.findMany({
          where: { walletAddress },
          select: { brandId: true, tokenId: true }
        }),
        prisma.zealyConnection.findMany({
          select: { brandId: true, communityId: true }
        })
      ]);

      const brandTokenMap = new Map<string, string>();
      const hasMembershipSet = new Set<string>();
      for (const membership of memberships) {
        hasMembershipSet.add(membership.brandId);
        if (membership.tokenId && !brandTokenMap.has(membership.brandId)) {
          brandTokenMap.set(membership.brandId, membership.tokenId);
        }
      }
      for (const ownership of ownerships) {
        hasMembershipSet.add(ownership.brandId);
        if (ownership.tokenId && !brandTokenMap.has(ownership.brandId)) {
          brandTokenMap.set(ownership.brandId, ownership.tokenId);
        }
      }
      for (const ledger of ledgers) {
        if (ledger.tokenId) {
          hasMembershipSet.add(ledger.brandId);
          if (!brandTokenMap.has(ledger.brandId)) {
            brandTokenMap.set(ledger.brandId, ledger.tokenId);
          }
        }
      }

      const zealyByBrand = new Map<string, string>();
      for (const connection of zealyConnections) {
        if (!zealyByBrand.has(connection.brandId)) {
          zealyByBrand.set(connection.brandId, connection.communityId);
        }
      }

      const rows = brands
        .map((brand) => {
          const tokenId = brandTokenMap.get(brand.id) ?? null;
          const hasMembership = hasMembershipSet.has(brand.id);
          return {
            id: brand.id,
            name: brand.name,
            logoUrl: resolveLogoUrl(brand.logoUrl),
            primaryChainId: brand.primaryChainId,
            hasZealyConfig: brand.hasZealyConfig,
            zealySubdomain: zealyByBrand.get(brand.id) ?? null,
            hasMembership,
            tokenId
          };
        })
        .filter((row) => (joinedOnly ? row.hasMembership : true));

      return res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/me/brands/:brandId/select",
  requireAuth,
  requireOwnerPortal,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const brandId = String(req.params.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      await ensureUser(auth.privyUserId, walletAddress);
      await prisma.portalSession.upsert({
        where: { privyUserId: auth.privyUserId },
        update: {
          portalType: "OWNER",
          brandId,
          walletAddress,
          isExplicit: true
        },
        create: {
          privyUserId: auth.privyUserId,
          portalType: "OWNER",
          brandId,
          walletAddress,
          isExplicit: true
        }
      });

      return res.json({ ok: true, brandId });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/me/brands/:brandId/join",
  requireAuth,
  requireOwnerPortal,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const brandId = String(req.params.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      await ensureUser(auth.privyUserId, walletAddress);

      const mintResult = await ensureBaseNftMinted(brandId, walletAddress);
      if (mintResult.state === "submitted") {
        return res.json({
          ok: true,
          state: "submitted",
          runId: mintResult.runId,
          requestId: mintResult.requestId,
          intentId: mintResult.intentId,
          tokenId: null
        });
      }

      return res.json({
        ok: true,
        state: "minted",
        runId: null,
        tokenId: mintResult.tokenId
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/me/runs/:runId",
  requireAuth,
  requireOwnerPortal,
  async (req: Request<{ runId: string }>, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const runId = String(req.params.runId || "").trim();
    if (!runId || !isUuid(runId)) {
      return res.status(400).json({ error: "Invalid runId" });
    }

    try {
      const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }

      if (run.wallet !== walletAddress) {
        return res.status(403).json({ error: "Not authorized for this run" });
      }

      return res.json({
        runId: run.id,
        brandId: run.brandId,
        status: run.status,
        txHash: run.txHash ?? null,
        requestId: run.requestId ?? null,
        intentId: run.txIntentId ?? null,
        krnlIntentId: run.intentId ?? null,
        error: run.error ?? null,
        updatedAt: run.updatedAt,
        createdAt: run.createdAt
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/me/brands/:brandId/asset-pack/active",
  requireAuth,
  requireOwnerPortal,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const brandId = String(req.params.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    try {
      const [brand, nftConfig] = await Promise.all([
        prisma.brand.findUnique({ where: { id: brandId } }),
        prisma.brandNftConfig.findUnique({ where: { brandId } })
      ]);
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      const activeAssetPackId = nftConfig?.activeAssetPackId ?? null;
      if (!activeAssetPackId) {
        return res.status(404).json({ error: "No active asset pack configured" });
      }

      const [pack, assets] = await Promise.all([
        prisma.nftAssetPack.findUnique({ where: { id: activeAssetPackId } }),
        prisma.nftAssetObject.findMany({
          where: { brandId, assetPackId: activeAssetPackId }
        })
      ]);
      if (!pack) {
        return res.status(404).json({ error: "Active asset pack not found" });
      }

      const baseObjectKey =
        assets.find((asset) => asset.kind === "base")?.objectKey ?? pack.baseImageKey ?? null;
      const layers = assets
        .filter((asset) => asset.kind === "layer" || asset.kind === "state")
        .map((asset) => {
          const parsed = splitStateKey(asset.stateKey);
          if (!parsed) return null;
          return {
            traitName: parsed.traitName,
            traitValue: parsed.traitValue,
            imageUrl: getPublicUrl(asset.objectKey)
          };
        })
        .filter((item): item is { traitName: string; traitValue: string; imageUrl: string } => !!item);

      return res.json({
        activeAssetPackId,
        baseImageUrl: baseObjectKey ? getPublicUrl(baseObjectKey) : null,
        layers
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/me/traits",
  requireAuth,
  requireOwnerPortal,
  async (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Missing wallet address" });
    }

    const brandId = String(req.query.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
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

      const traits = await prisma.unlockedTrait.findMany({
        where: { brandId, wallet: walletAddress },
        orderBy: { unlockedAt: "desc" }
      });

      const stateKeys: string[] = Array.from(
        new Set(traits.map((trait) => `${String(trait.traitKey)}:${String(trait.traitValue)}`))
      );
      const imageByStateKey = new Map<string, string>();
      const imageByStateKeyLower = new Map<string, string>();

      if (stateKeys.length > 0) {
        const nftConfig = await prisma.brandNftConfig.findUnique({
          where: { brandId },
          select: { activeAssetPackId: true }
        });

        if (nftConfig?.activeAssetPackId) {
          const activeAssets = await prisma.nftAssetObject.findMany({
            where: {
              brandId,
              assetPackId: nftConfig.activeAssetPackId,
              kind: { in: ["layer", "state"] },
              stateKey: { in: stateKeys }
            },
            orderBy: { createdAt: "desc" },
            select: { stateKey: true, objectKey: true }
          });
          for (const asset of activeAssets) {
            const key = String(asset.stateKey || "").trim();
            if (!key) continue;
            if (!imageByStateKey.has(key)) {
              imageByStateKey.set(key, getPublicUrl(asset.objectKey));
            }
            const lowerKey = key.toLowerCase();
            if (!imageByStateKeyLower.has(lowerKey)) {
              imageByStateKeyLower.set(lowerKey, getPublicUrl(asset.objectKey));
            }
          }
        }

        const missingStateKeys = stateKeys.filter(
          (key) =>
            !imageByStateKey.has(key) &&
            !imageByStateKeyLower.has(key.toLowerCase())
        );

        if (missingStateKeys.length > 0) {
          const fallbackAssets = await prisma.nftAssetObject.findMany({
            where: {
              brandId,
              kind: { in: ["layer", "state"] },
              stateKey: { in: missingStateKeys }
            },
            orderBy: { createdAt: "desc" },
            select: { stateKey: true, objectKey: true }
          });
          for (const asset of fallbackAssets) {
            const key = String(asset.stateKey || "").trim();
            if (!key) continue;
            if (!imageByStateKey.has(key)) {
              imageByStateKey.set(key, getPublicUrl(asset.objectKey));
            }
            const lowerKey = key.toLowerCase();
            if (!imageByStateKeyLower.has(lowerKey)) {
              imageByStateKeyLower.set(lowerKey, getPublicUrl(asset.objectKey));
            }
          }
        }
      }

      const unlocked = traits.map((trait) => ({
        imageUrl:
          imageByStateKey.get(`${trait.traitKey}:${trait.traitValue}`) ||
          imageByStateKeyLower.get(
            `${trait.traitKey}:${trait.traitValue}`.toLowerCase()
          ) ||
          null,
        id: trait.id,
        traitKey: trait.traitKey,
        traitValue: trait.traitValue,
        tokenId: trait.tokenId ?? null,
        unlockedAt: trait.unlockedAt,
        isActive: trait.isActive,
        activeAt: trait.activeAt
      }));

      const active = unlocked.filter((trait) => trait.isActive);

      res.json({ unlocked, active });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/me/open-lootbox",
  requireAuth,
  requireOwnerPortal,
  async (
    req: Request<unknown, unknown, { brandId?: string }>,
    res: Response
  ) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Missing wallet address" });
    }

    const brandId = String(req.body?.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      await ensureUser(auth.privyUserId, walletAddress);

      const mintResult = await ensureBaseNftMinted(brandId, walletAddress);
      if (mintResult.state === "submitted") {
        return res.json({
          ok: true,
          state: "submitted",
          runId: mintResult.runId,
          requestId: mintResult.requestId,
          intentId: mintResult.intentId
        });
      }
      const tokenId = mintResult.tokenId;
      if (!tokenId) {
        return res.status(500).json({ error: "Unable to resolve tokenId for lootbox action" });
      }

      const nftConfig = await prisma.brandNftConfig.findUnique({ where: { brandId } });
      const activeAssetPackId = nftConfig?.activeAssetPackId ?? null;
      if (!activeAssetPackId) {
        return res.status(400).json({ error: "Brand active asset pack is not set" });
      }

      const lootboxConfig = await prisma.lootboxConfig.findUnique({ where: { brandId } });
      const enabled = lootboxConfig?.enabled ?? true;
      const lootKeysPerOpen = Math.max(1, lootboxConfig?.lootKeysPerOpen ?? 1);
      const maxUnlocksPerOpen = Math.max(1, lootboxConfig?.maxUnlocksPerOpen ?? 1);
      if (!enabled) {
        return res.status(400).json({ error: "Lootbox is disabled for this brand" });
      }
      const lootEntries = normalizeLootTableEntries(lootboxConfig?.lootTable ?? { entries: [] });
      if (enabled && lootEntries.length === 0) {
        return res
          .status(400)
          .json({ error: "Lootbox config enabled but loot table is empty" });
      }

      const economyLedger = await prisma.userBrandEconomyLedger.findUnique({
        where: { brandId_wallet: { brandId, wallet: walletAddress } }
      });
      const lootKeysBalance = Math.max(0, economyLedger?.lootKeysBalance ?? 0);
      if (lootKeysBalance < lootKeysPerOpen) {
        return res.status(400).json({
          error: "Insufficient loot keys",
          requiredLootKeys: lootKeysPerOpen,
          currentLootKeys: lootKeysBalance
        });
      }

      const existingUnlockedTraits = await prisma.brandUserUnlockedTrait.findMany({
        where: { brandId, wallet: walletAddress },
        select: { traitName: true, traitValue: true }
      });
      const existingSet: Set<string> = new Set(
        existingUnlockedTraits.map((item) => `${item.traitName}::${item.traitValue}`)
      );
      const pickedEntries = sampleWeightedLootEntries({
        entries: lootEntries,
        count: maxUnlocksPerOpen,
        excludedKeys: existingSet
      });
      if (pickedEntries.length === 0) {
        return res.status(409).json({
          error: "No unlockable traits remaining for current lootbox",
          hint: "Update loot table entries or add new trait layers to active asset pack",
          alreadyUnlocked: existingSet.size,
          lootTableEntries: lootEntries.length
        });
      }
      const unlocked = await prisma.$transaction(async (tx) => {
        const consumed = await tx.userBrandEconomyLedger.updateMany({
          where: {
            brandId,
            wallet: walletAddress,
            lootKeysBalance: { gte: lootKeysPerOpen }
          },
          data: {
            lootKeysBalance: { decrement: lootKeysPerOpen }
          }
        });
        if (consumed.count === 0) {
          throw new Error("INSUFFICIENT_LOOT_KEYS");
        }

        const updatedLedger = await tx.userBrandEconomyLedger.findUnique({
          where: { brandId_wallet: { brandId, wallet: walletAddress } }
        });
        const newLootKeysBalance = Math.max(0, updatedLedger?.lootKeysBalance ?? 0);

        await tx.userLootBalance.upsert({
          where: { brandId_wallet: { brandId, wallet: walletAddress } },
          update: { lootKeys: newLootKeysBalance },
          create: { brandId, wallet: walletAddress, lootKeys: newLootKeysBalance }
        });

        await tx.userBrandLootLedger.upsert({
          where: { brandId_wallet: { brandId, wallet: walletAddress } },
          update: { lootKeysBalance: newLootKeysBalance },
          create: { brandId, wallet: walletAddress, lootKeysBalance: newLootKeysBalance }
        });

        await tx.brandUserLedger.upsert({
          where: { brandId_walletAddress: { brandId, walletAddress } },
          update: { lootKeys: newLootKeysBalance },
          create: { brandId, walletAddress, lootKeys: newLootKeysBalance, totalXp: 0 }
        });

        if (pickedEntries.length > 0) {
          await tx.brandUserUnlockedTrait.createMany({
            data: pickedEntries.map((entry) => ({
              brandId,
              wallet: walletAddress,
              traitName: entry.traitName,
              traitValue: entry.traitValue,
              unlockedAt: new Date()
            })),
            skipDuplicates: true
          });
          await tx.unlockedTrait.createMany({
            data: pickedEntries.map((entry) => ({
              brandId,
              wallet: walletAddress,
              tokenId,
              traitKey: entry.traitName,
              traitValue: entry.traitValue,
              sourceRunId: `offchain-lootbox:${brandId}:${walletAddress}`,
              unlockedAt: new Date()
            })),
            skipDuplicates: true
          });
        }

        return { newLootKeysBalance };
      });

      const { authResultHex, authSignatureHex } = encodeLootboxAuthData({
        tokenId,
        traitUpdates: pickedEntries.map((entry) => ({
          key: entry.traitName,
          value: entry.traitValue
        }))
      });
      const workflow = await submitLootboxWorkflow({
        brandId,
        walletAddress,
        tokenId,
        authResultHex,
        authSignatureHex,
        workflowRunType: "OPEN_LOOTBOX"
      });

      return res.json({
        ok: true,
        runId: workflow.workflowRunId,
        requestId: workflow.requestId ?? null,
        intentId: workflow.txIntentId ?? workflow.intentId ?? null,
        unlocked: pickedEntries.map((entry) => ({
          traitName: entry.traitName,
          traitValue: entry.traitValue
        })),
        lootKeysSpent: lootKeysPerOpen,
        lootKeysBalance: unlocked.newLootKeysBalance
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_LOOT_KEYS") {
        return res.status(400).json({ error: "Insufficient loot keys" });
      }
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/me/traits/activate",
  requireAuth,
  requireOwnerPortal,
  async (
    req: Request<
      unknown,
      unknown,
      { brandId?: string; selections?: Array<{ traitKey?: string; traitName?: string; traitValue?: string }> }
    >,
    res: Response
  ) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Missing wallet address" });
    }

    const brandId = String(req.body?.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
    if (selections.length === 0) {
      return res.status(400).json({ error: "No trait selections provided" });
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

      const mintResult = await ensureBaseNftMinted(brandId, walletAddress);
      if (mintResult.state === "submitted") {
        return res.json({
          ok: true,
          state: "submitted",
          runId: mintResult.runId,
          requestId: mintResult.requestId,
          intentId: mintResult.intentId
        });
      }
      const tokenId = mintResult.tokenId;
      if (!tokenId) {
        return res.status(500).json({ error: "Unable to resolve tokenId for activation" });
      }

      const uniqueSelections: Array<{ traitKey: string; traitValue: string }> = [];
      const seenSelections = new Set<string>();
      for (const selection of selections) {
        const traitKey = String(selection.traitKey || selection.traitName || "").trim();
        const traitValue = String(selection.traitValue || "").trim();
        if (!traitKey || !traitValue) continue;
        const key = `${traitKey}::${traitValue}`;
        if (seenSelections.has(key)) continue;
        seenSelections.add(key);
        uniqueSelections.push({ traitKey, traitValue });
      }

      if (uniqueSelections.length === 0) {
        return res.status(400).json({ error: "Invalid trait selections" });
      }
      if (uniqueSelections.length > 5) {
        return res.status(400).json({ error: "Maximum 5 active traits allowed" });
      }

      const existingTraits = await prisma.unlockedTrait.findMany({
        where: {
          brandId,
          wallet: walletAddress,
          OR: uniqueSelections.map((selection) => ({
            traitKey: selection.traitKey,
            traitValue: selection.traitValue
          }))
        }
      });

      if (existingTraits.length !== uniqueSelections.length) {
        return res.status(400).json({ error: "Trait not unlocked" });
      }

      const workflow = await submitSetActiveTraitsWorkflow({
        brandId,
        walletAddress,
        tokenId,
        traitSelections: uniqueSelections
      });
      if (DEMO_MODE) {
        await prisma.$transaction(async (tx) => {
          const now = new Date();
          for (const selection of uniqueSelections) {
            await tx.unlockedTrait.updateMany({
              where: {
                brandId,
                wallet: walletAddress,
                traitKey: selection.traitKey,
                isActive: true,
                NOT: { traitValue: selection.traitValue }
              },
              data: { isActive: false, activeAt: null }
            });
            await tx.unlockedTrait.updateMany({
              where: {
                brandId,
                wallet: walletAddress,
                traitKey: selection.traitKey,
                traitValue: selection.traitValue
              },
              data: { isActive: true, activeAt: now }
            });
          }
        });
      }

      const activeTraits = await prisma.unlockedTrait.findMany({
        where: {
          brandId,
          wallet: walletAddress,
          isActive: true
        },
        select: { traitKey: true, traitValue: true }
      });

      res.json({
        ok: true,
        runId: workflow.workflowRunId,
        active: activeTraits.map((trait) => ({
          traitName: trait.traitKey,
          traitValue: trait.traitValue
        }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/me/nfts",
  requireAuth,
  requireOwnerPortal,
  async (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Missing wallet address" });
    }

    const brandId = String(req.query.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      await ensureUser(auth.privyUserId, walletAddress);

      const memberships = await prisma.brandMembership.findMany({
        where: { brandId, wallet: walletAddress }
      });
      const ownerships = await prisma.tokenOwnership.findMany({
        where: { brandId, walletAddress }
      });
      const ledger = await prisma.brandUserLedger.findUnique({
        where: { brandId_walletAddress: { brandId, walletAddress } }
      });

      const tokenIds = new Set<string>();
      memberships.forEach((item) => tokenIds.add(item.tokenId));
      ownerships.forEach((item) => tokenIds.add(item.tokenId));
      if (ledger?.tokenId) tokenIds.add(ledger.tokenId);

      res.json({
        wallet: walletAddress,
        nfts: Array.from(tokenIds).map((tokenId) => ({ tokenId }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

const handleLootKeysBuy = async (
  req: Request<unknown, unknown, { brandId?: string; quantity?: number; qty?: number }>,
  res: Response
) => {
  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const walletAddress = auth.walletAddress;
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet required" });
  }

  const brandId = String(req.body?.brandId || "").trim();
  if (!brandId) {
    return res.status(400).json({ error: "brandId required" });
  }

  const quantity = Number(req.body?.quantity ?? req.body?.qty);
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "Invalid quantity" });
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) {
    return res.status(404).json({ error: "Brand not found" });
  }

  try {
    const lootboxConfig = await prisma.lootboxConfig.findUnique({ where: { brandId } });
    const xpPerLootKey = Math.max(
      1,
      lootboxConfig?.xpPerLootKey ?? lootboxConfig?.xpCost ?? resolveDefaultXpPerLootKey()
    );
    const requiredXp = calculatePurchaseXpRequired(quantity, xpPerLootKey);

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.userBrandEconomyLedger.upsert({
        where: { brandId_wallet: { brandId, wallet: walletAddress } },
        update: {},
        create: {
          brandId,
          wallet: walletAddress,
          zealyXpTotal: DEMO_DEFAULT_XP,
          xpSpent: 0,
          lootKeysBalance: 0
        }
      });

      const effectiveXpTotal =
        current.zealyXpTotal > 0 ? current.zealyXpTotal : DEMO_DEFAULT_XP;
      const currentAvailableXp = calculateXpAvailable(effectiveXpTotal, current.xpSpent);
      if (currentAvailableXp < requiredXp) {
        throw new Error(`INSUFFICIENT_XP:${currentAvailableXp}:${requiredXp}`);
      }

      const next = await tx.userBrandEconomyLedger.update({
        where: { brandId_wallet: { brandId, wallet: walletAddress } },
        data: {
          zealyXpTotal: effectiveXpTotal,
          xpSpent: { increment: requiredXp },
          lootKeysBalance: { increment: quantity }
        }
      });

      const xpRemaining = calculateXpAvailable(next.zealyXpTotal, next.xpSpent);

      await tx.userLootBalance.upsert({
        where: { brandId_wallet: { brandId, wallet: walletAddress } },
        update: { lootKeys: next.lootKeysBalance },
        create: { brandId, wallet: walletAddress, lootKeys: next.lootKeysBalance }
      });
      await tx.userBrandLootLedger.upsert({
        where: { brandId_wallet: { brandId, wallet: walletAddress } },
        update: { lootKeysBalance: next.lootKeysBalance },
        create: { brandId, wallet: walletAddress, lootKeysBalance: next.lootKeysBalance }
      });
      await tx.brandUserLedger.upsert({
        where: { brandId_walletAddress: { brandId, walletAddress } },
        update: { totalXp: xpRemaining, lootKeys: next.lootKeysBalance },
        create: {
          brandId,
          walletAddress,
          totalXp: xpRemaining,
          lootKeys: next.lootKeysBalance
        }
      });

      return {
        xpRemaining,
        lootKeys: next.lootKeysBalance
      };
    });

    return res.json({
      ok: true,
      xp: updated.xpRemaining,
      xpRemaining: updated.xpRemaining,
      lootKeys: updated.lootKeys,
      brandId
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_XP:")) {
      const [, currentValue = "0", requiredValue = "0"] = error.message.split(":");
      return res.status(409).json({
        error: "Insufficient XP",
        requiredXp: Number(requiredValue),
        currentXp: Number(currentValue)
      });
    }
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/me/lootkeys/buy", requireAuth, requireOwnerPortal, handleLootKeysBuy);
router.post("/me/lootkeys/purchase", requireAuth, requireOwnerPortal, handleLootKeysBuy);

router.get(
  "/me/balances",
  requireAuth,
  requireOwnerPortal,
  async (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const brandId = String(req.query.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    try {
      const [economy, xpLedger, userLootBalance, lootLedger, legacy] = await Promise.all([
        prisma.userBrandEconomyLedger.findUnique({
          where: { brandId_wallet: { brandId, wallet: walletAddress } }
        }),
        prisma.userBrandXpLedger.findUnique({
          where: { brandId_wallet: { brandId, wallet: walletAddress } }
        }),
        prisma.userLootBalance.findUnique({
          where: { brandId_wallet: { brandId, wallet: walletAddress } }
        }),
        prisma.userBrandLootLedger.findUnique({
          where: { brandId_wallet: { brandId, wallet: walletAddress } }
        }),
        prisma.brandUserLedger.findUnique({
          where: { brandId_walletAddress: { brandId, walletAddress } }
        })
      ]);

      const xpBalance =
        economy != null
          ? calculateXpAvailable(
              Math.max(0, economy.zealyXpTotal || DEMO_DEFAULT_XP),
              Math.max(0, economy.xpSpent || 0)
            )
          : xpLedger?.xpBalance ?? Math.max(0, legacy?.totalXp ?? 0);
      const lootKeysBalance =
        economy?.lootKeysBalance ??
        userLootBalance?.lootKeys ??
        lootLedger?.lootKeysBalance ??
        Math.max(0, legacy?.lootKeys ?? 0);
      return res.json({
        xp: xpBalance,
        lootKeys: lootKeysBalance,
        xpBalance,
        lootKeysBalance
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/me/xp",
  requireAuth,
  requireOwnerPortal,
  async (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const brandId = String(req.query.brandId || "").trim();
    if (!brandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      const [economyLedger, lootboxConfig] = await Promise.all([
        getOrCreateEconomyLedger(brandId, walletAddress),
        prisma.lootboxConfig.findUnique({
          where: { brandId }
        })
      ]);

      const spentXp = Math.max(0, economyLedger?.xpSpent ?? 0);
      const xpTotal = Math.max(0, economyLedger?.zealyXpTotal ?? DEMO_DEFAULT_XP);
      const availableXp = calculateXpAvailable(xpTotal, spentXp);
      const lootKeysBalance = Math.max(0, economyLedger?.lootKeysBalance ?? 0);
      const xpPerLootKey = Math.max(
        1,
        lootboxConfig?.xpPerLootKey ?? lootboxConfig?.xpCost ?? resolveDefaultXpPerLootKey()
      );
      const lootKeysPerOpen = Math.max(1, lootboxConfig?.lootKeysPerOpen ?? 1);

      res.json({
        brandId,
        wallet: walletAddress,
        zealyXpTotal: xpTotal,
        zealyXp: xpTotal,
        spentXp,
        xpAvailable: availableXp,
        availableXp,
        lootKeysBalance,
        xpPerLootKey,
        lootKeysPerOpen,
        lootboxXpCost: xpPerLootKey,
        lootboxEnabled: lootboxConfig?.enabled ?? true,
        xp: availableXp,
        xpSource: "demo-ledger"
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
