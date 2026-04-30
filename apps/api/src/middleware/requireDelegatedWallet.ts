import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { getWalletStatus } from "../services/walletStatusService";

export const requireDelegatedWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const bodyWallet =
    req.body && typeof (req.body as { walletAddress?: unknown }).walletAddress === "string"
      ? ((req.body as { walletAddress?: string }).walletAddress as string)
      : undefined;
  let walletAddress = req.auth?.walletAddress || bodyWallet;

  const brandId = (req.params as { brandId?: string }).brandId;
  if (brandId) {
    try {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return res.status(404).json({ error: "Brand not found" });
      }
      walletAddress =
        brand.automationWalletAddress ||
        brand.krnlSenderAddress ||
        process.env.KRNL_SENDER_ADDRESS ||
        walletAddress;
    } catch (error) {
      console.error("[wallet-status] failed to load brand", error);
      return res.status(500).json({ error: "Failed to load brand" });
    }
  }
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet required" });
  }

  try {
    const status = await getWalletStatus(walletAddress);
    if (!status.isDelegated) {
      return res.status(400).json({
        error: "wallet_not_delegated",
        message: "Delegate execution (EIP-7702) before running workflows."
      });
    }
    if (req.auth) {
      req.auth.walletAddress = walletAddress;
    }
    return next();
  } catch (error) {
    console.error("[wallet-status] failed", error);
    return res.status(500).json({ error: "Failed to check wallet delegation" });
  }
};
