import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { getWalletStatus } from "../services/walletStatusService";

const router = Router();

const ensureUser = async (privyId: string, wallet?: string | null) => {
  return prisma.user.upsert({
    where: { privyId },
    update: wallet ? { wallet } : {},
    create: { privyId, wallet }
  });
};

router.get(
  "/auth/wallet-status",
  requireAuth,
  async (req: Request, res: Response) => {
    const walletAddress = req.auth?.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    try {
      const status = await getWalletStatus(walletAddress);
      res.json({
        walletAddress: status.walletAddress,
        chainId: status.chainId,
        isDelegated: status.isDelegated
      });
    } catch (error) {
      console.error("[wallet-status] failed", error);
      res.status(500).json({ error: "Failed to check wallet delegation" });
    }
  }
);

router.post(
  "/auth/select-portal",
  requireAuth,
  async (
    req: Request<unknown, unknown, { portalType?: "brand" | "owner"; brandId?: string }>,
    res: Response
  ) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const walletAddress = auth.walletAddress?.toLowerCase();
    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const portalType = req.body?.portalType;
    const brandIdInput = typeof req.body?.brandId === "string" ? req.body?.brandId.trim() : "";
    const brandId = brandIdInput.length > 0 ? brandIdInput : null;
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (portalType !== "brand" && portalType !== "owner") {
      return res.status(400).json({ error: "Invalid portal type" });
    }

    try {
      const existing = await prisma.portalSession.findUnique({
        where: { privyUserId: auth.privyUserId }
      });
      if (portalType === "owner") {
        await prisma.portalSession.upsert({
          where: { privyUserId: auth.privyUserId },
          update: { portalType: "OWNER", brandId: null, walletAddress, isExplicit: true },
          create: { privyUserId: auth.privyUserId, walletAddress, portalType: "OWNER", isExplicit: true }
        });
        console.log(
          `[portal] select userId=${auth.privyUserId} wallet=${walletAddress} portal=owner brandId=null preserved=false`
        );
        return res.json({ portalType: "owner", brandId: null });
      }

      const hasValidBrandId = Boolean(brandId && isUuid(brandId));
      let finalBrandId: string | null = null;
      let preserved = false;
      if (hasValidBrandId) {
        finalBrandId = brandId!;
      } else if (existing?.portalType === "BRAND" && existing.brandId) {
        finalBrandId = existing.brandId;
        preserved = true;
      }

      if (finalBrandId) {
        const brand = await prisma.brand.findUnique({ where: { id: finalBrandId } });
        if (!brand) {
          return res.status(404).json({ error: "Brand not found" });
        }

        if (brand.ownerUserId !== auth.privyUserId) {
          return res.status(403).json({ error: "Not authorized for this brand" });
        }
      }

      await prisma.portalSession.upsert({
        where: { privyUserId: auth.privyUserId },
        update: { portalType: "BRAND", brandId: finalBrandId, walletAddress, isExplicit: true },
        create: { privyUserId: auth.privyUserId, walletAddress, portalType: "BRAND", brandId: finalBrandId, isExplicit: true }
      });

      console.log(
        `[portal] select userId=${auth.privyUserId} wallet=${walletAddress} portal=brand brandId=${finalBrandId ?? "null"} preserved=${preserved}`
      );
      return res.json({ portalType: "brand", brandId: finalBrandId });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  const portalType = req.portal?.portalType ?? null;
  const brandId = req.portal?.brandId ?? null;
  const walletAddress = req.portal?.lastWalletAddress ?? null;
  console.log(
    `[portal] get userId=${req.auth?.privyUserId ?? "null"} wallet=${walletAddress ?? "null"} portal=${portalType ?? "null"} brandId=${brandId ?? "null"}`
  );
  res.json({ walletAddress, portalType, brandId });
});

router.post("/auth/logout", requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const walletAddress = auth.walletAddress?.toLowerCase();
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet required" });
  }

  try {
    await prisma.portalSession.deleteMany({
      where: { privyUserId: auth.privyUserId }
    });
    console.log(
      `[portal] logout cleared selection userId=${auth.privyUserId} wallet=${walletAddress}`
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error("[portal] logout failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
