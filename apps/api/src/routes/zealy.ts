import { Prisma } from "@prisma/client";
import { Request, Response, Router } from "express";
import { prisma } from "../db";
import {
  lookupUserByWallet,
  normalizeZealyWebhookPayload,
  ZealyApiError
} from "../services/zealyService";
import { buildZealyEventId } from "../services/zealyAutomationWorker";
import { ensureBaseNftMinted } from "../services/nftService";
import {
  computeWebhookCredits,
  normalizeXpMode,
  type EffectiveRewardRule
} from "../services/rewardRulePolicy";

interface ZealyWebhookBody {
  subdomain?: string;
  zealySubdomain?: string;
  questId?: string;
  zealyQuestId?: string;
  userId?: string;
  wallet?: string;
  status?: string;
  [key: string]: unknown;
}

const router = Router();

const verifyWebhookSecret = (req: Request, sharedSecret?: string | null): boolean => {
  if (!sharedSecret) return true;
  const provided =
    req.header("x-zealy-webhook-secret") ||
    req.header("x-zealy-signature") ||
    req.header("x-webhook-secret") ||
    "";
  return provided === sharedSecret;
};

const resolveCommunityId = (payload: Record<string, unknown>, fallback: string) => {
  const candidate =
    payload.communityId ||
    payload.community_id ||
    payload.community ||
    payload.subdomain ||
    payload.zealySubdomain;
  return String(candidate ?? fallback ?? "").trim();
};

const resolveQuestId = (payload: Record<string, unknown>, fallback: string) => {
  const candidate =
    payload.questId ||
    payload.zealyQuestId ||
    payload.quest_id ||
    (payload.quest && typeof payload.quest === "object"
      ? (payload.quest as Record<string, unknown>).id
      : undefined);
  return String(candidate ?? fallback ?? "").trim();
};

const resolveWallet = (payload: Record<string, unknown>, fallback?: string) => {
  const candidate = payload.wallet || payload.walletAddress || payload.address;
  return String(candidate ?? fallback ?? "").trim();
};

const resolveZealyXpFromPayload = (payload: Record<string, unknown>): number | null => {
  const quest = payload.quest && typeof payload.quest === "object"
    ? (payload.quest as Record<string, unknown>)
    : undefined;
  const candidates: unknown[] = [
    payload.xp,
    payload.xpDelta,
    payload.xpReward,
    payload.rewardXp,
    payload.questXp,
    payload.earnedXp,
    quest?.xp,
    quest?.xpReward
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(0, Math.floor(candidate));
    }
    if (typeof candidate === "string") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }
  }
  return null;
};

const resolveZealyXpTotal = async (args: {
  payload: Record<string, unknown>;
  communityId: string;
  walletAddress: string;
  fallbackQuestXp: number;
}): Promise<number> => {
  const payloadXp = resolveZealyXpFromPayload(args.payload);
  if (payloadXp !== null) {
    return payloadXp;
  }

  try {
    const user = await lookupUserByWallet(args.communityId, args.walletAddress);
    return Math.max(0, user.xp);
  } catch (error) {
    if (error instanceof ZealyApiError) {
      return Math.max(0, args.fallbackQuestXp);
    }
    throw error;
  }
};

const getEffectiveRewardRule = async (
  brandId: string,
  zealyQuestId: string
): Promise<EffectiveRewardRule> => {
  const rewardRule = await prisma.brandRewardRule.findUnique({
    where: { brandId_questId: { brandId, questId: zealyQuestId } }
  });
  if (rewardRule) {
    const xpMode = normalizeXpMode(rewardRule.xpMode) || "ZEALY";
    return {
      enabled: rewardRule.enabled,
      lootKeysDelta: rewardRule.lootKeysDelta ?? 0,
      xpMode,
      xpOverride: rewardRule.xpOverride ?? null
    };
  }

  const legacyRule = await prisma.brandQuestRewardRule.findUnique({
    where: { brandId_zealyQuestId: { brandId, zealyQuestId } }
  });
  if (legacyRule) {
    return {
      enabled: legacyRule.enabled !== false,
      lootKeysDelta: legacyRule.lootKeyDelta ?? 0,
      xpMode: "ZEALY",
      xpOverride: null
    };
  }

  return {
    enabled: true,
    lootKeysDelta: 0,
    xpMode: "ZEALY",
    xpOverride: null
  };
};

const applyWebhookReward = async (args: {
  brandId: string;
  walletAddress: string;
  zealyQuestId: string;
  zealyEventId: string;
  zealyXpTotal: number;
  lootKeyDelta: number;
}) => {
  await prisma.$transaction(async (tx) => {
    const existingEconomy = await tx.userBrandEconomyLedger.findUnique({
      where: { brandId_wallet: { brandId: args.brandId, wallet: args.walletAddress } }
    });
    const previousZealyXp = Math.max(0, existingEconomy?.zealyXpTotal ?? 0);

    const nextEconomy = await tx.userBrandEconomyLedger.upsert({
      where: { brandId_wallet: { brandId: args.brandId, wallet: args.walletAddress } },
      update: {
        zealyXpTotal: args.zealyXpTotal,
        lootKeysBalance: { increment: args.lootKeyDelta }
      },
      create: {
        brandId: args.brandId,
        wallet: args.walletAddress,
        zealyXpTotal: args.zealyXpTotal,
        xpSpent: 0,
        lootKeysBalance: args.lootKeyDelta
      }
    });

    await tx.userBrandXpLedger.upsert({
      where: { brandId_wallet: { brandId: args.brandId, wallet: args.walletAddress } },
      update: { xpBalance: args.zealyXpTotal },
      create: {
        brandId: args.brandId,
        wallet: args.walletAddress,
        xpBalance: args.zealyXpTotal
      }
    });

    await tx.userBrandLootLedger.upsert({
      where: { brandId_wallet: { brandId: args.brandId, wallet: args.walletAddress } },
      update: { lootKeysBalance: nextEconomy.lootKeysBalance },
      create: {
        brandId: args.brandId,
        wallet: args.walletAddress,
        lootKeysBalance: nextEconomy.lootKeysBalance
      }
    });

    await tx.userLootBalance.upsert({
      where: { brandId_wallet: { brandId: args.brandId, wallet: args.walletAddress } },
      update: { lootKeys: nextEconomy.lootKeysBalance },
      create: {
        brandId: args.brandId,
        wallet: args.walletAddress,
        lootKeys: nextEconomy.lootKeysBalance
      }
    });

    // Keep legacy ledger synchronized for existing code paths.
    await tx.brandUserLedger.upsert({
      where: { brandId_walletAddress: { brandId: args.brandId, walletAddress: args.walletAddress } },
      update: {
        totalXp: args.zealyXpTotal,
        lootKeys: nextEconomy.lootKeysBalance
      },
      create: {
        brandId: args.brandId,
        walletAddress: args.walletAddress,
        totalXp: args.zealyXpTotal,
        lootKeys: nextEconomy.lootKeysBalance
      }
    });

    const xpDelta = args.zealyXpTotal - previousZealyXp;
    await tx.zealyRewardAudit.create({
      data: {
        brandId: args.brandId,
        walletAddress: args.walletAddress,
        zealyQuestId: args.zealyQuestId,
        xpDelta,
        lootKeyDelta: args.lootKeyDelta,
        webhookEventId: args.zealyEventId
      }
    });

    await tx.zealyWebhookEvent.update({
      where: { zealyEventId: args.zealyEventId },
      data: {
        status: "processed",
        processedAt: new Date(),
        error: null
      }
    });
  });
};

router.post(
  "/zealy/webhook/:brandId",
  async (req: Request<{ brandId: string }, unknown, ZealyWebhookBody>, res: Response) => {
    const { brandId } = req.params;
    const payload = (req.body ?? {}) as Prisma.InputJsonValue;

    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      const zealyConnection = await prisma.zealyConnection.findFirst({
        where: { brandId }
      });
      const sharedSecret = zealyConnection?.webhookSecret || process.env.ZEALY_WEBHOOK_SECRET;
      if (!verifyWebhookSecret(req, sharedSecret)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const event = normalizeZealyWebhookPayload(req);
      const communityId = resolveCommunityId(body, event.subdomain || zealyConnection?.communityId || brandId);
      const eventType = event.status || "unknown";
      const zealyEventId = buildZealyEventId(payload, `${brandId}-${communityId}`);
      const zealyQuestId = resolveQuestId(body, event.questId);
      let walletAddress = resolveWallet(body, event.wallet);

      if (!walletAddress && event.zealyUserId) {
        const identity = await prisma.userIdentity.findUnique({
          where: { brandId_zealyUserId: { brandId, zealyUserId: event.zealyUserId } }
        });
        walletAddress = identity?.walletAddress ?? "";
      }

      try {
        await prisma.zealyWebhookEvent.create({
          data: {
            brandId,
            communityId,
            eventType,
            zealyEventId,
            payloadJson: payload,
            status: "received"
          }
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return res.json({ ok: true });
        }
        throw error;
      }

      const normalizedType = eventType.toLowerCase();
      if (!normalizedType.includes("complete")) {
        await prisma.zealyWebhookEvent.update({
          where: { zealyEventId },
          data: {
            status: "ignored",
            processedAt: new Date(),
            error: "Event not a quest completion"
          }
        });
        return res.json({ ok: true });
      }

      if (!zealyQuestId || !walletAddress) {
        await prisma.zealyWebhookEvent.update({
          where: { zealyEventId },
          data: {
            status: "ignored",
            processedAt: new Date(),
            error: !zealyQuestId ? "Missing zealyQuestId" : "Missing wallet address"
          }
        });
        return res.json({ ok: true });
      }

      const rule = await getEffectiveRewardRule(
        brandId,
        zealyQuestId
      );
      const zealyQuest = await prisma.zealyQuest.findFirst({
        where: { brandId, zealyQuestId }
      });
      const zealyXpTotal = await resolveZealyXpTotal({
        payload: body,
        communityId,
        walletAddress,
        fallbackQuestXp: zealyQuest?.xp ?? 0
      });
      const creditedLootKeys = rule.enabled
        ? computeWebhookCredits({
            rule,
            zealyXp: zealyXpTotal
          }).creditedLootKeys
        : 0;

      await ensureBaseNftMinted(brandId, walletAddress);
      await applyWebhookReward({
        brandId,
        walletAddress,
        zealyQuestId,
        zealyEventId,
        zealyXpTotal,
        lootKeyDelta: creditedLootKeys
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/zealy/webhook",
  async (req: Request, res: Response) => {
    try {
      const payload = (req.body ?? {}) as Prisma.InputJsonValue;
      const event = normalizeZealyWebhookPayload(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const communityId = resolveCommunityId(body, event.subdomain);

      const zealyConnection = await prisma.zealyConnection.findFirst({
        where: { communityId }
      });

      if (!zealyConnection) {
        return res.status(404).json({ error: "Unknown Zealy community" });
      }

      const sharedSecret = process.env.ZEALY_WEBHOOK_SECRET || zealyConnection.webhookSecret;
      if (!verifyWebhookSecret(req, sharedSecret)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      const brand = await prisma.brand.findUnique({ where: { id: zealyConnection.brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }

      const zealyEventId = buildZealyEventId(payload, `${brand.id}-${communityId}`);
      const zealyQuestId = resolveQuestId(body, event.questId);
      let walletAddress = resolveWallet(body, event.wallet);
      const eventType = event.status || "unknown";

      if (!walletAddress && event.zealyUserId) {
        const identity = await prisma.userIdentity.findUnique({
          where: { brandId_zealyUserId: { brandId: brand.id, zealyUserId: event.zealyUserId } }
        });
        walletAddress = identity?.walletAddress ?? "";
      }

      try {
        await prisma.zealyWebhookEvent.create({
          data: {
            brandId: brand.id,
            communityId: zealyConnection.communityId,
            eventType,
            zealyEventId,
            payloadJson: payload,
            status: "received"
          }
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return res.json({ ok: true });
        }
        throw error;
      }

      const normalizedType = eventType.toLowerCase();
      if (!normalizedType.includes("complete")) {
        await prisma.zealyWebhookEvent.update({
          where: { zealyEventId },
          data: {
            status: "ignored",
            processedAt: new Date(),
            error: "Event not a quest completion"
          }
        });
        return res.json({ ok: true });
      }

      if (!zealyQuestId || !walletAddress) {
        await prisma.zealyWebhookEvent.update({
          where: { zealyEventId },
          data: {
            status: "ignored",
            processedAt: new Date(),
            error: !zealyQuestId ? "Missing zealyQuestId" : "Missing wallet address"
          }
        });
        return res.json({ ok: true });
      }

      const rule = await getEffectiveRewardRule(
        brand.id,
        zealyQuestId
      );
      const zealyQuest = await prisma.zealyQuest.findFirst({
        where: { brandId: brand.id, zealyQuestId }
      });
      const zealyXpTotal = await resolveZealyXpTotal({
        payload: body,
        communityId: zealyConnection.communityId,
        walletAddress,
        fallbackQuestXp: zealyQuest?.xp ?? 0
      });
      const creditedLootKeys = rule.enabled
        ? computeWebhookCredits({
            rule,
            zealyXp: zealyXpTotal
          }).creditedLootKeys
        : 0;

      await ensureBaseNftMinted(brand.id, walletAddress);
      await applyWebhookReward({
        brandId: brand.id,
        walletAddress,
        zealyQuestId,
        zealyEventId,
        zealyXpTotal,
        lootKeyDelta: creditedLootKeys
      });

      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
