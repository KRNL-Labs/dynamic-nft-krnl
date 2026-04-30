import { Prisma, ZealyEvent } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "../db";
import { encodeQuestAuthData } from "./authDataEncoder";
import { readCoreTraits } from "./chainTraitService";
import { pollUntilTxHashStrict, submitQuestRewardWorkflow } from "./krnlService";
import { resolveEvolvingTokenId } from "./nftService";
import { upsertTokenRecord } from "./tokenService";

const decimalToNumber = (value: Prisma.Decimal | number) => new Prisma.Decimal(value).toNumber();

export const extractZealyEventId = (raw: Prisma.InputJsonValue): string | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const candidates = [record.eventId, record.id, record.event_id, record.eventID];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    if (typeof candidate === "number") return String(candidate);
  }
  return undefined;
};

export const buildZealyEventKey = (args: {
  subdomain: string;
  zealyQuestId: string;
  wallet: string;
  status: string;
  eventId?: string;
}): string => {
  const key = [args.subdomain, args.zealyQuestId, args.wallet, args.status, args.eventId ?? ""].join("|");
  return createHash("sha256").update(key).digest("hex");
};

export const processZealyEvent = async (
  event: ZealyEvent
): Promise<{ ok: true; txHash?: string }> => {
  if (event.status === "completed") {
    return { ok: true, txHash: event.txHash ?? undefined };
  }

  await prisma.zealyEvent.update({
    where: { id: event.id },
    data: { status: "processing", errorMessage: null }
  });

  try {
    const brand = await prisma.brand.findUnique({ where: { id: event.brandId } });
    if (!brand) {
      throw new Error("Brand not found");
    }

    const nftConfig = await prisma.brandNftConfig.findUnique({
      where: { brandId: event.brandId }
    });
    if (!nftConfig) {
      throw new Error("NFT config not found for brand");
    }

    const quest =
      (await prisma.quest.findFirst({
        where: { brandId: event.brandId, zealyQuestId: event.zealyQuestId }
      })) ||
      (await prisma.quest.create({
        data: {
          brandId: event.brandId,
          zealyQuestId: event.zealyQuestId,
          title: "Zealy Quest",
          description: "Auto-created from Zealy event",
          xpReward: 0,
          active: true
        }
      }));

    const rewardRule = await prisma.questReward.findFirst({
      where: { questId: quest.id, brandId: event.brandId }
    });
    if (!rewardRule) {
      throw new Error("Reward not configured for quest");
    }

    const existingQuestState = await prisma.userQuestState.findFirst({
      where: {
        brandId: event.brandId,
        questId: quest.id,
        wallet: event.wallet
      }
    });

    if (existingQuestState?.status === "rewarded") {
      await prisma.zealyEvent.update({
        where: { id: event.id },
        data: { status: "completed" }
      });
      return { ok: true, txHash: event.txHash ?? undefined };
    }

    await prisma.userQuestState.upsert({
      where: {
        brandId_questId_wallet: {
          brandId: event.brandId,
          questId: quest.id,
          wallet: event.wallet
        }
      },
      update: {
        status: "completed",
        lastUpdateAt: new Date()
      },
      create: {
        brandId: event.brandId,
        questId: quest.id,
        wallet: event.wallet,
        status: "completed"
      }
    });

    let brandCredits = new Prisma.Decimal(brand.sponsorshipCredits);
    const existingMembership = await prisma.brandMembership.findFirst({
      where: { brandId: event.brandId, wallet: event.wallet, role: "evolving" }
    });

    let tokenId: string;
    if (!existingMembership) {
      if (decimalToNumber(brandCredits) <= 0) {
        throw new Error("Insufficient sponsorship credits");
      }
      tokenId = await resolveEvolvingTokenId({
        brandId: event.brandId,
        wallet: event.wallet
      });

      brandCredits = brandCredits.minus(1);
      await prisma.brand.update({
        where: { id: event.brandId },
        data: { sponsorshipCredits: brandCredits }
      });
    } else {
      tokenId = existingMembership.tokenId;
      await upsertTokenRecord({
        tokenId,
        brandId: event.brandId,
        ownerAddress: event.wallet
      });
    }

    if (!event.workflowRunId && decimalToNumber(brandCredits) <= 0) {
      throw new Error("Insufficient sponsorship credits");
    }

    const xpDelta = 0;
    const lootKeysDelta = rewardRule.lootKeysDelta ?? 0;
    const { xp: currentXp, lootKeys: currentLootKeys } = await readCoreTraits({
      rpcUrl: nftConfig.rpcUrl,
      contractAddress: nftConfig.contractAddress,
      tokenId
    });
    const newLootKeys = currentLootKeys + BigInt(lootKeysDelta);

    const rewardTraitUpdates = Array.isArray(rewardRule.traitUpdates)
      ? (rewardRule.traitUpdates as Array<{ key: string; value: string }>)
      : [];
    const traitUpdates = [
      { key: "LOOT_KEYS", value: newLootKeys.toString() },
      { key: `QUEST_${quest.zealyQuestId}`, value: "1" },
      ...rewardTraitUpdates
    ];

    const { authResultHex, authSignatureHex } = encodeQuestAuthData({
      tokenId,
      questIdNumeric: BigInt(0),
      zealyQuestId: quest.zealyQuestId,
      xpDelta,
      lootKeysDelta,
      traitUpdates
    });

    let workflowRunId = event.workflowRunId;
    if (!workflowRunId) {
      const workflow = await submitQuestRewardWorkflow({
        brandId: event.brandId,
        walletAddress: event.wallet,
        zealyQuestId: quest.zealyQuestId,
        questId: quest.id,
        tokenId,
        authResultHex,
        authSignatureHex
      });

      workflowRunId = workflow.workflowRunId;
      await prisma.zealyEvent.update({
        where: { id: event.id },
        data: { workflowRunId }
      });

      brandCredits = brandCredits.minus(0.5);
      await prisma.brand.update({
        where: { id: event.brandId },
        data: { sponsorshipCredits: brandCredits }
      });
    }

    const txHash = await pollUntilTxHashStrict(workflowRunId);

    await prisma.userQuestState.update({
      where: {
        brandId_questId_wallet: {
          brandId: event.brandId,
          questId: quest.id,
          wallet: event.wallet
        }
      },
      data: { status: "rewarded" }
    });

    await prisma.zealyEvent.update({
      where: { id: event.id },
      data: {
        status: "completed",
        txHash,
        errorMessage: null
      }
    });

    return { ok: true, txHash };
  } catch (error) {
    await prisma.zealyEvent.update({
      where: { id: event.id },
      data: {
        status: "failed",
        errorMessage: (error as Error).message
      }
    });
    throw error;
  }
};
