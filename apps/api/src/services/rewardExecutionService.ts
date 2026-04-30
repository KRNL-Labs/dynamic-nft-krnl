import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { encodeQuestAuthData } from "./authDataEncoder";
import { readCoreTraits } from "./chainTraitService";
import {
  pollUntilTxHashStrict,
  submitMintWorkflow,
  submitQuestRewardWorkflow
} from "./krnlService";
import { extractTokenIdFromMintReceipt } from "./nftService";
import { upsertTokenRecord } from "./tokenService";

export class RewardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardConfigError";
  }
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super("insufficient_credits");
    this.name = "InsufficientCreditsError";
  }
}

export class RewardExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardExecutionError";
  }
}

const decimalToNumber = (value: Prisma.Decimal | number) => new Prisma.Decimal(value).toNumber();

const MINT_CREDIT_COST = 1;
const QUEST_REWARD_CREDIT_COST = 0.5;

const resolveTokenWithMint = async (args: {
  brandId: string;
  walletAddress: string;
  rpcUrl: string;
  contractAddress: string;
  transactionIntentDelegate?: string;
  transactionIntentId?: string;
  transactionIntentDeadline?: number;
  userSignature?: string;
}): Promise<{ tokenId: string; mintTxHash: string }> => {
  const existing = await prisma.brandMembership.findFirst({
    where: { brandId: args.brandId, wallet: args.walletAddress, role: "evolving" }
  });
  if (existing) {
    await upsertTokenRecord({
      tokenId: existing.tokenId,
      brandId: args.brandId,
      ownerAddress: args.walletAddress
    });
    return { tokenId: existing.tokenId, mintTxHash: "" };
  }

  const workflow = await submitMintWorkflow({
    brandId: args.brandId,
    walletAddress: args.walletAddress,
    transactionIntentDelegate: args.transactionIntentDelegate,
    transactionIntentId: args.transactionIntentId,
    transactionIntentDeadline: args.transactionIntentDeadline,
    userSignature: args.userSignature
  });
  const mintTxHash = await pollUntilTxHashStrict(workflow.workflowRunId);
  const tokenId = await extractTokenIdFromMintReceipt({
    rpcUrl: args.rpcUrl,
    contractAddress: args.contractAddress,
    txHash: mintTxHash,
    expectedUserWallet: args.walletAddress
  });

  await prisma.brandMembership.create({
    data: {
      brandId: args.brandId,
      wallet: args.walletAddress,
      tokenId,
      role: "evolving"
    }
  });
  await upsertTokenRecord({
    tokenId,
    brandId: args.brandId,
    ownerAddress: args.walletAddress
  });

  return { tokenId, mintTxHash };
};

export const executeQuestReward = async (args: {
  brandId: string;
  walletAddress: string;
  zealyQuestId: string;
  transactionIntentDelegate?: string;
  transactionIntentId?: string;
  transactionIntentDeadline?: number;
  userSignature?: string;
}): Promise<{ ok: true; workflowId: string; txHash?: string }> => {
  const {
    brandId,
    walletAddress,
    zealyQuestId,
    transactionIntentDelegate,
    transactionIntentId,
    transactionIntentDeadline,
    userSignature
  } = args;

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) {
    throw new RewardExecutionError("Brand not found");
  }

  const nftConfig = await prisma.brandNftConfig.findUnique({ where: { brandId } });
  if (!nftConfig) {
    throw new RewardExecutionError("NFT config not found");
  }

  const zealyConfig = await prisma.brandZealyConfig.findUnique({ where: { brandId } });
  if (!zealyConfig) {
    throw new RewardExecutionError("Zealy config not found");
  }

  const quest = await prisma.zealyQuest.findFirst({
    where: { brandId, zealyQuestId }
  });
  if (!quest) {
    throw new RewardExecutionError("Quest not found");
  }

  const rewardRule = await prisma.brandQuestRewardRule.findFirst({
    where: { brandId, zealyQuestId }
  });
  if (!rewardRule) {
    throw new RewardConfigError("Reward not configured for quest");
  }

  let credits = new Prisma.Decimal(brand.sponsorshipCredits);

  const existingMembership = await prisma.brandMembership.findFirst({
    where: { brandId, wallet: walletAddress, role: "evolving" }
  });

  const requiredCredits = existingMembership
    ? QUEST_REWARD_CREDIT_COST
    : MINT_CREDIT_COST + QUEST_REWARD_CREDIT_COST;

  if (decimalToNumber(credits) < requiredCredits) {
    throw new InsufficientCreditsError();
  }

  let tokenId: string;
  let mintTxHash = "";
  if (existingMembership) {
    tokenId = existingMembership.tokenId;
    await upsertTokenRecord({
      tokenId,
      brandId,
      ownerAddress: walletAddress
    });
  } else {
    const tokenResolution = await resolveTokenWithMint({
      brandId,
      walletAddress,
      rpcUrl: nftConfig.rpcUrl,
      contractAddress: nftConfig.contractAddress,
      transactionIntentDelegate,
      transactionIntentId,
      transactionIntentDeadline,
      userSignature
    });
    tokenId = tokenResolution.tokenId;
    mintTxHash = tokenResolution.mintTxHash;

    credits = credits.minus(MINT_CREDIT_COST);
    await prisma.brand.update({
      where: { id: brandId },
      data: { sponsorshipCredits: credits }
    });
  }

  const xpDelta = 0;
  const lootKeysDelta = rewardRule.lootKeyDelta ?? 0;

  const { xp: currentXp, lootKeys: currentLootKeys } = await readCoreTraits({
    rpcUrl: nftConfig.rpcUrl,
    contractAddress: nftConfig.contractAddress,
    tokenId
  });
  const newLootKeys = currentLootKeys + BigInt(lootKeysDelta);

  const traitUpdates = [
    { key: "LOOT_KEYS", value: newLootKeys.toString() },
    { key: `QUEST_${quest.zealyQuestId}`, value: "1" },
  ];

  const { authResultHex, authSignatureHex } = encodeQuestAuthData({
    tokenId,
    questIdNumeric: BigInt(0),
    zealyQuestId: quest.zealyQuestId,
    xpDelta,
    lootKeysDelta,
    traitUpdates
  });

  const submitPath = process.env.KRNL_SUBMIT_PATH || "/workflow";
  console.log(`[reward] submitting KRNL workflow method=POST path=${submitPath}`);

  const workflow = await submitQuestRewardWorkflow({
    brandId,
    walletAddress,
    zealyQuestId: quest.zealyQuestId,
    questId: undefined,
    tokenId,
    authResultHex,
    authSignatureHex,
    transactionIntentDelegate,
    transactionIntentId,
    transactionIntentDeadline,
    userSignature
  });

  credits = credits.minus(QUEST_REWARD_CREDIT_COST);
  await prisma.brand.update({
    where: { id: brandId },
    data: { sponsorshipCredits: credits }
  });

  const txHash = await pollUntilTxHashStrict(workflow.workflowRunId);

  console.log(`[reward] workflow ${workflow.workflowRunId} status=completed txHash=${txHash}`);

  return { ok: true, workflowId: workflow.workflowRunId, txHash };
};
