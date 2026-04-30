import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/requireAuth";

const ensureUser = async (privyId: string, wallet?: string | null) => {
  return prisma.user.upsert({
    where: { privyId },
    update: wallet ? { wallet } : {},
    create: { privyId, wallet }
  });
};

const router = Router();

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

router.get(
  "/workflows/:runId",
  requireAuth,
  async (req: Request<{ runId: string }>, res: Response) => {
    const { runId } = req.params;
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (!runId || runId === "undefined" || !isUuid(runId)) {
      return res.status(400).json({ error: "invalid runId" });
    }

    try {
      const owner = await ensureUser(auth.privyUserId, auth.walletAddress);
      const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!run) {
        return res.status(404).json({ error: "Workflow run not found" });
      }

      const brand = await prisma.brand.findUnique({ where: { id: run.brandId } });
      if (!brand || brand.ownerUserId !== auth.privyUserId) {
        return res.status(403).json({ error: "Not authorized for this workflow" });
      }

      res.json({
        id: run.id,
        brandId: run.brandId,
        type: run.type,
        workflowName: run.workflowName ?? null,
        status: run.status,
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
        createdAt: run.createdAt,
        updatedAt: run.updatedAt
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
