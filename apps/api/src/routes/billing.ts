import { Prisma } from "@prisma/client";
import { Request, Response, Router } from "express";
import { prisma } from "../db";

interface BillingWebhookBody {
  paymentId?: string;
  brandId?: string;
  amount?: number;
  status?: string;
}

const router = Router();

router.post(
  "/billing/x402/webhook",
  async (req: Request<unknown, unknown, BillingWebhookBody>, res: Response) => {
    const { paymentId, brandId, amount, status } = req.body || {};
    if (!paymentId || !brandId) {
      return res.status(401).json({ error: "Invalid payment callback" });
    }

    try {
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.brandId !== brandId) {
        return res.status(401).json({ error: "Invalid payment callback" });
      }

      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(401).json({ error: "Invalid payment callback" });
      }

      const isSuccess = status === "completed" || status === "success";
      const creditedAmount = typeof amount === "number" ? amount : undefined;

      // TODO: Validate webhook authenticity and reconcile payment with x402.
      if (isSuccess) {
        await prisma.$transaction([
          prisma.payment.update({
            where: { id: paymentId },
            data: { status: "completed" }
          }),
          prisma.brand.update({
            where: { id: brandId },
            data: {
              sponsorshipCredits: new Prisma.Decimal(brand.sponsorshipCredits).plus(
                creditedAmount !== undefined ? creditedAmount : payment.amount
              )
            }
          })
        ]);
      } else {
        await prisma.payment.update({
          where: { id: paymentId },
          data: { status: status ?? payment.status }
        });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
