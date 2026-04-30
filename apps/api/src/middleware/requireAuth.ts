import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { verifyAccessToken } from "../services/privyService";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }
  const header = req.header("authorization") || req.header("Authorization") || "";
  const hasAuthHeader = header.startsWith("Bearer ");
  if (!hasAuthHeader) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = header.substring("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await verifyAccessToken(token);
    const headerWallet =
      req.header("x-wallet-address") || req.header("X-Wallet-Address") || undefined;
    const normalizedWallet = headerWallet ? headerWallet.toLowerCase() : null;
    if (!normalizedWallet) {
      console.warn(`[wallet] missing x-wallet-address for path=${req.originalUrl}`);
    }
    req.auth = {
      ...result,
      walletAddress: normalizedWallet
    };
    const session = await prisma.portalSession.findUnique({
      where: { privyUserId: result.privyUserId }
    });
    if (session) {
      req.portal = {
        portalType: session.portalType === "BRAND" ? "brand" : "owner",
        brandId: session.brandId ?? null,
        isExplicit: session.isExplicit,
        lastWalletAddress: session.walletAddress ?? null
      };
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[portal] load userId=${result.privyUserId} portal=${req.portal.portalType} brandId=${req.portal.brandId ?? "null"} explicit=${req.portal.isExplicit ? "true" : "false"}`
        );
      }
      if (normalizedWallet && session.walletAddress !== normalizedWallet) {
        await prisma.portalSession.update({
          where: { privyUserId: result.privyUserId },
          data: { walletAddress: normalizedWallet }
        });
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.log(`[portal] load userId=${result.privyUserId} portal=none brandId=null`);
    }
    return next();
  } catch (error) {
    console.error("Auth failed", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
