import { ActionQueueStatus, ActionQueueType, Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "../db";
import { encodeLootboxAuthData, encodeQuestAuthData } from "./authDataEncoder";
import { readCoreTraits } from "./chainTraitService";
import {
  pollUntilTxHashByIntent,
  submitLootboxWorkflow,
  submitMintWorkflow,
  submitQuestRewardWorkflow
} from "./krnlService";
import { extractTokenIdFromMintReceipt } from "./nftService";
import { upsertTokenRecord } from "./tokenService";

const EVENT_POLL_INTERVAL_MS = Number(process.env.ZEALY_EVENT_POLL_INTERVAL_MS || 5000);
const ACTION_POLL_INTERVAL_MS = Number(process.env.ACTION_QUEUE_POLL_INTERVAL_MS || 5000);
const MAX_ATTEMPTS = 5;

const MINT_CREDIT_COST = new Prisma.Decimal(1);
const QUEST_REWARD_CREDIT_COST = new Prisma.Decimal(0.5);
const LOOTBOX_CREDIT_COST = new Prisma.Decimal(0.5);

const decimalToNumber = (value: Prisma.Decimal | number) => new Prisma.Decimal(value).toNumber();

let eventWorkerRunning = false;
let actionWorkerRunning = false;

const extractPayloadFields = (payload: Prisma.JsonValue) => {
  const record = (payload || {}) as Record<string, unknown>;
  const zealyQuestId = String(
    record.questId ?? record.zealyQuestId ?? record.quest_id ?? record.questID ?? ""
  ).trim();
  const zealyUserId = record.userId ? String(record.userId) : undefined;
  const walletAddress = record.wallet ? String(record.wallet) : undefined;
  const status = String(record.status ?? record.event ?? "").trim().toLowerCase();
  const communityId = String(
    record.subdomain ?? record.communityId ?? record.community_id ?? ""
  ).trim();
  return { zealyQuestId, zealyUserId, walletAddress, status, communityId };
};

const hashPayload = (payload: Prisma.InputJsonValue) => {
  const serialized = JSON.stringify(payload ?? {});
  return createHash("sha256").update(serialized).digest("hex");
};

const isRetryDue = (item: { updatedAt: Date; attempts: number }) => {
  if (item.attempts <= 0) return true;
  const base = 10_000;
  const backoff = Math.min(Math.pow(2, item.attempts - 1) * base, 5 * 60_000);
  return Date.now() - item.updatedAt.getTime() >= backoff;
};

const ensureQuestRewardRule = async (brandId: string, zealyQuestId: string) => {
  const existing = await prisma.brandQuestRewardRule.findUnique({
    where: { brandId_zealyQuestId: { brandId, zealyQuestId } }
  });
  return existing;
};

const ensureActionQueued = async (args: {
  brandId: string;
  walletAddress: string;
  tokenId?: string | null;
  actionType: ActionQueueType;
  payload: Record<string, unknown>;
}) => {
  const { brandId, walletAddress, tokenId, actionType, payload } = args;
  const zealyEventId = payload.zealyEventId;
  if (typeof zealyEventId === "string" && zealyEventId.length > 0) {
    const existing = await prisma.actionQueueItem.findFirst({
      where: {
        brandId,
        actionType,
        payloadJson: {
          path: ["zealyEventId"],
          equals: zealyEventId
        }
      }
    });
    if (existing) return existing;
  }

  return prisma.actionQueueItem.create({
    data: {
      brandId,
      walletAddress,
      tokenId: tokenId ?? null,
      actionType,
      payloadJson: payload as Prisma.InputJsonValue,
      status: ActionQueueStatus.PENDING
    }
  });
};

const handleZealyEvent = async (eventId: string) => {
  const event = await prisma.zealyWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  try {
    const payload = event.payloadJson as Prisma.JsonValue;
    const { zealyQuestId, zealyUserId, walletAddress, status } = extractPayloadFields(payload);

    if (!zealyQuestId) {
      await prisma.zealyWebhookEvent.update({
        where: { id: event.id },
        data: { status: "failed", error: "Missing zealyQuestId", processedAt: new Date() }
      });
      return;
    }

    const normalizedStatus = status || event.eventType?.toLowerCase() || "unknown";
    if (![
      "completed",
      "approved",
      "quest_completed",
      "quest_approved"
    ].includes(normalizedStatus)) {
      await prisma.zealyWebhookEvent.update({
        where: { id: event.id },
        data: { status: "ignored", processedAt: new Date() }
      });
      return;
    }

    let resolvedWallet = walletAddress?.toLowerCase();
    if (!resolvedWallet && zealyUserId) {
      const identity = await prisma.userIdentity.findFirst({
        where: { brandId: event.brandId, zealyUserId }
      });
      resolvedWallet = identity?.walletAddress?.toLowerCase();
    }

    if (!resolvedWallet) {
      await prisma.zealyWebhookEvent.update({
        where: { id: event.id },
        data: { status: "failed", error: "Missing wallet address", processedAt: new Date() }
      });
      return;
    }

    if (zealyUserId) {
      await prisma.userIdentity.upsert({
        where: { brandId_zealyUserId: { brandId: event.brandId, zealyUserId } },
        update: { walletAddress: resolvedWallet, lastSeenAt: new Date() },
        create: {
          brandId: event.brandId,
          zealyUserId,
          walletAddress: resolvedWallet
        }
      });
    }

    const rewardRule = await ensureQuestRewardRule(event.brandId, zealyQuestId);
    if (!rewardRule || !rewardRule.enabled) {
      await prisma.zealyWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: rewardRule ? "ignored" : "failed",
          error: rewardRule ? null : "Reward rule not configured",
          processedAt: new Date()
        }
      });
      return;
    }

    const tokenOwnership = await prisma.tokenOwnership.findFirst({
      where: { brandId: event.brandId, walletAddress: resolvedWallet }
    });

    const basePayload = {
      zealyEventId: event.zealyEventId,
      zealyQuestId,
      zealyUserId,
      walletAddress: resolvedWallet,
      xpDelta: 0,
      lootKeyDelta: rewardRule.lootKeyDelta
    };

    if (!tokenOwnership) {
      await ensureActionQueued({
        brandId: event.brandId,
        walletAddress: resolvedWallet,
        tokenId: null,
        actionType: ActionQueueType.MINT_BASE_NFT,
        payload: basePayload
      });
    }

    await ensureActionQueued({
      brandId: event.brandId,
      walletAddress: resolvedWallet,
      tokenId: tokenOwnership?.tokenId ?? null,
      actionType: ActionQueueType.APPLY_QUEST_RESULT,
      payload: basePayload
    });

    // Lootboxes are user-initiated; do not auto-open here.

    await prisma.zealyWebhookEvent.update({
      where: { id: event.id },
      data: { status: "enqueued", processedAt: new Date(), error: null }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.zealyWebhookEvent.update({
      where: { id: event.id },
      data: { status: "failed", error: message, processedAt: new Date() }
    });
  }
};

const processZealyWebhookEvents = async () => {
  if (eventWorkerRunning) return;
  eventWorkerRunning = true;
  try {
    const events = await prisma.zealyWebhookEvent.findMany({
      where: { status: { in: ["received", "processing"] }, processedAt: null },
      orderBy: { receivedAt: "asc" },
      take: 10
    });

    for (const event of events) {
      await prisma.zealyWebhookEvent.update({
        where: { id: event.id },
        data: { status: "processing" }
      });
      await handleZealyEvent(event.id);
    }
  } catch (error) {
    console.error("[zealy-worker] failed to process webhook events", error);
  } finally {
    eventWorkerRunning = false;
  }
};

const resolveTokenId = async (item: {
  brandId: string;
  walletAddress: string;
  tokenId?: string | null;
}) => {
  if (item.tokenId) return item.tokenId;
  const ownership = await prisma.tokenOwnership.findFirst({
    where: { brandId: item.brandId, walletAddress: item.walletAddress }
  });
  if (ownership) return ownership.tokenId;
  const membership = await prisma.brandMembership.findFirst({
    where: { brandId: item.brandId, wallet: item.walletAddress, role: "evolving" }
  });
  if (membership) return membership.tokenId;
  return null;
};

const runMintAction = async (item: {
  id: string;
  brandId: string;
  walletAddress: string;
}) => {
  const existingMembership = await prisma.brandMembership.findFirst({
    where: { brandId: item.brandId, wallet: item.walletAddress, role: "evolving" }
  });
  if (existingMembership) {
    await prisma.actionQueueItem.update({
      where: { id: item.id },
      data: { tokenId: existingMembership.tokenId }
    });
    await prisma.tokenOwnership.upsert({
      where: {
        brandId_tokenId: { brandId: item.brandId, tokenId: existingMembership.tokenId }
      },
      update: { walletAddress: item.walletAddress },
      create: {
        brandId: item.brandId,
        tokenId: existingMembership.tokenId,
        walletAddress: item.walletAddress
      }
    });
    await upsertTokenRecord({
      tokenId: existingMembership.tokenId,
      brandId: item.brandId,
      ownerAddress: item.walletAddress
    });
    return;
  }

  const brand = await prisma.brand.findUnique({ where: { id: item.brandId } });
  if (!brand) throw new Error("Brand not found");
  const nftConfig = await prisma.brandNftConfig.findUnique({ where: { brandId: item.brandId } });
  if (!nftConfig) throw new Error("NFT config not found");
  if (
    decimalToNumber(brand.sponsorshipCredits) < decimalToNumber(QUEST_REWARD_CREDIT_COST)
  ) {
    throw new Error("Insufficient sponsorship credits");
  }

  if (decimalToNumber(brand.sponsorshipCredits) < decimalToNumber(MINT_CREDIT_COST)) {
    throw new Error("Insufficient sponsorship credits");
  }

  const submission = await submitMintWorkflow({
    brandId: item.brandId,
    walletAddress: item.walletAddress,
    actionQueueItemId: item.id
  });

  const txHash = await pollUntilTxHashByIntent(
    submission.workflowRunId,
    submission.intentId
  );

  const tokenId = await extractTokenIdFromMintReceipt({
    rpcUrl: nftConfig.rpcUrl,
    contractAddress: nftConfig.contractAddress,
    txHash,
    expectedUserWallet: item.walletAddress
  });

  await prisma.brandMembership.upsert({
    where: {
      brandId_wallet_role: { brandId: item.brandId, wallet: item.walletAddress, role: "evolving" }
    },
    update: { tokenId },
    create: {
      brandId: item.brandId,
      wallet: item.walletAddress,
      tokenId,
      role: "evolving"
    }
  });

  await prisma.tokenOwnership.upsert({
    where: { brandId_tokenId: { brandId: item.brandId, tokenId } },
    update: { walletAddress: item.walletAddress },
    create: {
      brandId: item.brandId,
      tokenId,
      walletAddress: item.walletAddress
    }
  });

  await upsertTokenRecord({ tokenId, brandId: item.brandId, ownerAddress: item.walletAddress });

  await prisma.brand.update({
    where: { id: item.brandId },
    data: {
      sponsorshipCredits: new Prisma.Decimal(brand.sponsorshipCredits).minus(MINT_CREDIT_COST)
    }
  });

  await prisma.actionQueueItem.update({
    where: { id: item.id },
    data: { tokenId }
  });
};

const runQuestRewardAction = async (item: {
  id: string;
  brandId: string;
  walletAddress: string;
  tokenId?: string | null;
  payloadJson: Prisma.JsonValue;
}) => {
  const tokenId = await resolveTokenId(item);
  if (!tokenId) {
    throw new Error("Token not minted yet");
  }

  const payload = (item.payloadJson || {}) as Record<string, any>;
  const zealyQuestId = String(payload.zealyQuestId || "");
  if (!zealyQuestId) {
    throw new Error("Missing zealyQuestId");
  }

  const brand = await prisma.brand.findUnique({ where: { id: item.brandId } });
  if (!brand) throw new Error("Brand not found");
  const nftConfig = await prisma.brandNftConfig.findUnique({ where: { brandId: item.brandId } });
  if (!nftConfig) throw new Error("NFT config not found");

  if (
    decimalToNumber(brand.sponsorshipCredits) < decimalToNumber(QUEST_REWARD_CREDIT_COST)
  ) {
    throw new Error("Insufficient sponsorship credits");
  }

  const syncedQuest = await prisma.zealyQuest.findFirst({
    where: { brandId: item.brandId, zealyQuestId }
  });
  if (!syncedQuest) {
    throw new Error("Synced quest not found");
  }

  const rewardRule = await prisma.brandQuestRewardRule.findUnique({
    where: { brandId_zealyQuestId: { brandId: item.brandId, zealyQuestId } }
  });

  if (!rewardRule) {
    throw new Error("Reward rule not configured");
  }

  const xpDelta = 0;
  const lootKeysDelta = rewardRule.lootKeyDelta ?? 0;
  const { lootKeys: currentLootKeys } = await readCoreTraits({
    rpcUrl: nftConfig.rpcUrl,
    contractAddress: nftConfig.contractAddress,
    tokenId
  });
  const newLootKeys = currentLootKeys + BigInt(lootKeysDelta);

  const traitUpdates = [
    { key: "LOOT_KEYS", value: newLootKeys.toString() },
    { key: `QUEST_${zealyQuestId}`, value: "1" }
  ];

  const { authResultHex, authSignatureHex } = encodeQuestAuthData({
    tokenId,
    questIdNumeric: BigInt(0),
    zealyQuestId,
    xpDelta,
    lootKeysDelta,
    traitUpdates
  });

  const submission = await submitQuestRewardWorkflow({
    brandId: item.brandId,
    walletAddress: item.walletAddress,
    zealyQuestId,
    questId: undefined,
    tokenId,
    authResultHex,
    authSignatureHex,
    actionQueueItemId: item.id
  });

  await pollUntilTxHashByIntent(submission.workflowRunId, submission.intentId);

  await prisma.brand.update({
    where: { id: item.brandId },
    data: {
      sponsorshipCredits: new Prisma.Decimal(brand.sponsorshipCredits).minus(
        QUEST_REWARD_CREDIT_COST
      )
    }
  });
};

const runLootboxAction = async (item: {
  id: string;
  brandId: string;
  walletAddress: string;
  tokenId?: string | null;
}) => {
  const tokenId = await resolveTokenId(item);
  if (!tokenId) {
    throw new Error("Token not minted yet");
  }

  const brand = await prisma.brand.findUnique({ where: { id: item.brandId } });
  if (!brand) throw new Error("Brand not found");

  if (decimalToNumber(brand.sponsorshipCredits) < decimalToNumber(LOOTBOX_CREDIT_COST)) {
    throw new Error("Insufficient sponsorship credits");
  }

  const { authResultHex, authSignatureHex } = encodeLootboxAuthData({
    tokenId,
    traitUpdates: []
  });

  const submission = await submitLootboxWorkflow({
    brandId: item.brandId,
    walletAddress: item.walletAddress,
    tokenId,
    authResultHex,
    authSignatureHex,
    actionQueueItemId: item.id
  });

  await pollUntilTxHashByIntent(submission.workflowRunId, submission.intentId);

  await prisma.brand.update({
    where: { id: item.brandId },
    data: {
      sponsorshipCredits: new Prisma.Decimal(brand.sponsorshipCredits).minus(LOOTBOX_CREDIT_COST)
    }
  });
};

const runUpdateXpAction = async (item: {
  id: string;
  brandId: string;
  walletAddress: string;
  tokenId?: string | null;
  payloadJson: Prisma.JsonValue;
}) => {
  const tokenId = await resolveTokenId(item);
  if (!tokenId) {
    throw new Error("Token not minted yet");
  }

  const payload = (item.payloadJson || {}) as Record<string, any>;
  const xpDelta = 0;
  const lootKeysDelta = Number(payload.lootKeyDelta ?? 0);

  const brand = await prisma.brand.findUnique({ where: { id: item.brandId } });
  if (!brand) throw new Error("Brand not found");
  const nftConfig = await prisma.brandNftConfig.findUnique({ where: { brandId: item.brandId } });
  if (!nftConfig) throw new Error("NFT config not found");

  const { lootKeys: currentLootKeys } = await readCoreTraits({
    rpcUrl: nftConfig.rpcUrl,
    contractAddress: nftConfig.contractAddress,
    tokenId
  });
  const newLootKeys = currentLootKeys + BigInt(lootKeysDelta);

  const traitUpdates = [
    { key: "LOOT_KEYS", value: newLootKeys.toString() }
  ];

  const { authResultHex, authSignatureHex } = encodeQuestAuthData({
    tokenId,
    questIdNumeric: BigInt(0),
    zealyQuestId: "",
    xpDelta,
    lootKeysDelta,
    traitUpdates
  });

  const submission = await submitQuestRewardWorkflow({
    brandId: item.brandId,
    walletAddress: item.walletAddress,
    zealyQuestId: "",
    questId: undefined,
    tokenId,
    authResultHex,
    authSignatureHex,
    actionQueueItemId: item.id
  });

  await pollUntilTxHashByIntent(submission.workflowRunId, submission.intentId);

  await prisma.brand.update({
    where: { id: item.brandId },
    data: {
      sponsorshipCredits: new Prisma.Decimal(brand.sponsorshipCredits).minus(
        QUEST_REWARD_CREDIT_COST
      )
    }
  });
};

const executeAction = async (item: {
  id: string;
  brandId: string;
  walletAddress: string;
  tokenId?: string | null;
  actionType: ActionQueueType;
  payloadJson: Prisma.JsonValue;
}) => {
  switch (item.actionType) {
    case ActionQueueType.MINT_BASE_NFT:
      await runMintAction(item);
      return;
    case ActionQueueType.APPLY_QUEST_RESULT:
      await runQuestRewardAction(item);
      return;
    case ActionQueueType.OPEN_LOOTBOX:
      await runLootboxAction(item);
      return;
    case ActionQueueType.UPDATE_XP:
      await runUpdateXpAction(item);
      return;
    default:
      throw new Error(`Unsupported action type ${item.actionType}`);
  }
};

const processActionQueue = async () => {
  if (actionWorkerRunning) return;
  actionWorkerRunning = true;
  try {
    const items = await prisma.actionQueueItem.findMany({
      where: {
        status: { in: [ActionQueueStatus.PENDING, ActionQueueStatus.FAILED] },
        attempts: { lt: MAX_ATTEMPTS }
      },
      orderBy: { createdAt: "asc" },
      take: 5
    });

    for (const item of items) {
      if (item.status === ActionQueueStatus.FAILED && !isRetryDue(item)) {
        continue;
      }

      await prisma.actionQueueItem.update({
        where: { id: item.id },
        data: {
          status: ActionQueueStatus.RUNNING,
          attempts: { increment: 1 },
          lastError: null
        }
      });

      try {
        await executeAction(item);
        await prisma.actionQueueItem.update({
          where: { id: item.id },
          data: { status: ActionQueueStatus.SUCCEEDED }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await prisma.actionQueueItem.update({
          where: { id: item.id },
          data: {
            status: ActionQueueStatus.FAILED,
            lastError: message
          }
        });
      }
    }
  } catch (error) {
    console.error("[action-queue] failed to process items", error);
  } finally {
    actionWorkerRunning = false;
  }
};

export const startZealyAutomationWorkers = () => {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[zealy-worker] starting intervals events=${EVENT_POLL_INTERVAL_MS}ms actions=${ACTION_POLL_INTERVAL_MS}ms`
    );
  }
  setInterval(processZealyWebhookEvents, EVENT_POLL_INTERVAL_MS);
  setInterval(processActionQueue, ACTION_POLL_INTERVAL_MS);
  void processZealyWebhookEvents();
  void processActionQueue();
};

export const buildZealyEventId = (payload: Prisma.InputJsonValue, fallback: string) => {
  const extracted = (payload && typeof payload === "object") ? (payload as any) : null;
  const idCandidate = extracted?.eventId || extracted?.id || extracted?.event_id || extracted?.eventID;
  if (typeof idCandidate === "string" && idCandidate.trim()) return idCandidate;
  if (typeof idCandidate === "number") return String(idCandidate);
  return `${fallback}-${hashPayload(payload)}`;
};
