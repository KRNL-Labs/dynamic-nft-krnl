import { Prisma } from "@prisma/client";
import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { getAddress } from "ethers";
import { requireAuth } from "../middleware/requireAuth";
import { pingKrnlNode } from "../services/krnlNodeClient";
import { buildZealyEventKey, processZealyEvent } from "../services/zealyEventProcessor";
import {
  executeQuestReward,
  InsufficientCreditsError,
  RewardConfigError,
  RewardExecutionError
} from "../services/rewardExecutionService";

interface SimulateQuestBody {
  brandId?: string;
  wallet?: string;
  zealyQuestId?: string;
  status?: string;
}

interface TriggerRewardBody {
  walletAddress?: string;
  zealyQuestId?: string;
  userSignature?: string;
  intentSignature?: string;
  transactionIntentSignature?: string;
  transactionIntentDelegate?: string;
  delegate?: string;
  transactionIntentId?: string;
  transactionIntentDeadline?: number;
}

interface DevContractBody {
  contractAddress?: string;
}

const router = Router();

const ensureUser = async (privyId: string, wallet?: string | null) => {
  return prisma.user.upsert({
    where: { privyId },
    update: wallet ? { wallet } : {},
    create: { privyId, wallet }
  });
};

router.post(
  "/dev/brands/:brandId/setup-sepolia",
  requireAuth,
  async (req: Request<{ brandId: string }>, res: Response) => {
    const { brandId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) {
      return res.status(400).json({ error: "SEPOLIA_RPC_URL is not set" });
    }

    const defaultContract = process.env.DEFAULT_NFT_CONTRACT_ADDRESS;
    if (!defaultContract) {
      return res.status(400).json({ error: "DEFAULT_NFT_CONTRACT_ADDRESS is not set" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      await prisma.brandNftConfig.upsert({
        where: { brandId },
        update: {
          contractAddress: defaultContract,
          chainId: 11155111,
          rpcUrl
        },
        create: {
          brandId,
          contractAddress: defaultContract,
          chainId: 11155111,
          rpcUrl
        }
      });

      res.json({ ok: true });
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

router.get("/dev/krnl/ping", requireAuth, async (_req: Request, res: Response) => {
  const auth = _req.auth;
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await pingKrnlNode();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/dev/brands/:brandId/nft/contract",
  requireAuth,
  async (req: Request<{ brandId: string }, unknown, DevContractBody>, res: Response) => {
    const { brandId } = req.params;
    const { contractAddress } = req.body || {};
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (!contractAddress) {
      return res.status(400).json({ error: "contractAddress is required" });
    }

    let checksummed: string;
    try {
      checksummed = getAddress(contractAddress);
    } catch {
      return res.status(400).json({ error: "Invalid contract address" });
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) {
      return res.status(400).json({ error: "SEPOLIA_RPC_URL is not set" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      await prisma.brandNftConfig.upsert({
        where: { brandId },
        update: {
          contractAddress: checksummed,
          chainId: 11155111,
          rpcUrl
        },
        create: {
          brandId,
          contractAddress: checksummed,
          chainId: 11155111,
          rpcUrl
        }
      });

      res.json({ ok: true, contractAddress: checksummed });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/dev/brands/:brandId/rewards/trigger",
  requireAuth,
  async (req: Request<{ brandId: string }, unknown, TriggerRewardBody>, res: Response) => {
    const { brandId } = req.params;
    const { walletAddress, zealyQuestId } = req.body || {};
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (!walletAddress || !zealyQuestId) {
      return res.status(400).json({ error: "walletAddress and zealyQuestId are required" });
    }

    try {
      const body = req.body || {};
      const userSignature =
        body.userSignature || body.intentSignature || body.transactionIntentSignature;
      if (!userSignature || userSignature === "0x") {
        return res.status(400).json({ error: "missing_user_signature" });
      }

      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const result = await executeQuestReward({
        brandId,
        walletAddress,
        zealyQuestId,
        transactionIntentDelegate: body.transactionIntentDelegate || body.delegate,
        transactionIntentId: body.transactionIntentId,
        transactionIntentDeadline: body.transactionIntentDeadline,
        userSignature
      });

      res.json(result);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return res.status(402).json({ error: "insufficient_credits" });
      }
      if (error instanceof RewardConfigError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof RewardExecutionError) {
        return res.status(500).json({ error: error.message });
      }
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/dev/simulate/quest-completed",
  requireAuth,
  async (req: Request<unknown, unknown, SimulateQuestBody>, res: Response) => {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { brandId, wallet, zealyQuestId, status } = req.body || {};
    if (!brandId || !wallet || !zealyQuestId || !status) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (status !== "completed" && status !== "approved") {
      return res.status(400).json({ error: "Status must be completed or approved" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this brand" });
      }

      const zealyConfig = await prisma.brandZealyConfig.findFirst({
        where: { brandId }
      });
      if (!zealyConfig) {
        return res.status(400).json({ error: "Brand Zealy config not found" });
      }

      const eventKey = buildZealyEventKey({
        subdomain: zealyConfig.zealySubdomain,
        zealyQuestId,
        wallet,
        status
      });

      let event = null;
      try {
        event = await prisma.zealyEvent.create({
          data: {
            brandId,
            eventKey,
            zealySubdomain: zealyConfig.zealySubdomain,
            zealyQuestId,
            wallet,
            status: "received"
          }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          event = await prisma.zealyEvent.findFirst({
            where: { brandId, eventKey }
          });
        } else {
          throw error;
        }
      }

      if (!event) {
        return res.status(500).json({ error: "Failed to create or load Zealy event" });
      }

      const result = await processZealyEvent(event);
      res.json({ ok: true, eventId: event.id, txHash: result.txHash ?? null });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
