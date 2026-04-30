import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";

const portalNotSelected = (res: Response) =>
  res.status(409).json({ error: "Portal not selected" });

const wrongPortal = (res: Response) =>
  res.status(403).json({ error: "Wrong portal" });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const ensureUser = async (privyId: string, wallet?: string | null) => {
  return prisma.user.upsert({
    where: { privyId },
    update: wallet ? { wallet } : {},
    create: { privyId, wallet }
  });
};

export const requirePortalSelection = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }
  if (!req.portal) {
    return portalNotSelected(res);
  }
  return next();
};

export const requireOwnerPortal = async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }
  const privyUserId = req.auth?.privyUserId ?? "";
  const walletAddress = req.auth?.walletAddress ?? null;
  if (!privyUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet required" });
  }

  const selection = req.portal;
  const userPortal = selection?.portalType ?? "null";
  const selBrandId = selection?.brandId ?? null;
  const routeBrandId = req.params.brandId ?? null;
  const selectionExplicit = selection?.isExplicit === true;
  if (selectionExplicit && selection?.portalType !== "owner") {
    console.log(
      `[portal-guard] path=${req.originalUrl} required=owner userPortal=${userPortal} selBrandId=${selBrandId ?? "null"} routeBrandId=${routeBrandId ?? "null"} decision=deny reason=wrong-portal`
    );
    return wrongPortal(res);
  }

  const inferredPortal = "owner";
  if (!selection) {
    try {
      await prisma.portalSession.upsert({
        where: { privyUserId },
        update: { portalType: "OWNER", brandId: null, walletAddress, isExplicit: false },
        create: { privyUserId, walletAddress, portalType: "OWNER", brandId: null, isExplicit: false }
      });
    } catch (error) {
      console.error("[portal] auto-select owner failed", error);
    }
    req.portal = { portalType: inferredPortal, brandId: null, isExplicit: false };
  } else if (!selectionExplicit) {
    req.portal = { portalType: inferredPortal, brandId: selection.brandId ?? null, isExplicit: false };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[portal] userId=${privyUserId} sel=${selection ? JSON.stringify({ portalType: selection.portalType, brandId: selection.brandId ?? null, isExplicit: selection.isExplicit === true }) : "null"} route=${req.originalUrl} inferred=${inferredPortal} mutated=${!selection ? "create" : selectionExplicit ? "none" : "use-inferred"}`
    );
  }

  if (req.portal?.portalType !== "owner") {
    console.log(
      `[portal-guard] path=${req.originalUrl} required=owner userPortal=${req.portal?.portalType ?? "null"} selBrandId=${req.portal?.brandId ?? "null"} routeBrandId=${routeBrandId ?? "null"} decision=deny reason=wrong-portal`
    );
    return wrongPortal(res);
  }
  console.log(
    `[portal-guard] path=${req.originalUrl} required=owner userPortal=${req.portal?.portalType ?? "null"} selBrandId=${req.portal?.brandId ?? "null"} routeBrandId=${routeBrandId ?? "null"} decision=allow reason=ok`
  );
  return next();
};

export const requireBrandPortal = async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }
  const privyUserId = req.auth?.privyUserId ?? "";
  const walletAddress = req.auth?.walletAddress ?? "";
  if (!privyUserId || !walletAddress) {
    return res.status(400).json({ error: "Wallet required" });
  }

  const selection = req.portal;
  const rawPath = req.originalUrl.split("?")[0];
  const match = rawPath.match(
    /^\/api\/brands\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i
  );
  const routeBrandId = match ? match[1] : null;
  const isBrandScoped = Boolean(routeBrandId && isUuid(routeBrandId));
  const selPortal = selection?.portalType ?? null;
  const selBrandId = selection?.brandId ?? null;
  const required = isBrandScoped ? "brandScoped" : "brandPortal";

  let decision = "allow";
  let reason = "ok";
  if (selPortal && selPortal !== "brand") {
    decision = "wrong-portal";
    reason = "wrong-portal";
  } else if (!selPortal) {
    decision = "portal-not-selected";
    reason = "portal-not-selected";
  } else if (isBrandScoped && !selBrandId) {
    decision = "portal-not-selected";
    reason = "brandId-required";
  } else if (isBrandScoped && selBrandId !== routeBrandId) {
    decision = "brand-mismatch";
    reason = "brand-mismatch";
  }

  console.log(
    `[portal-guard] path=${req.originalUrl} required=${required} userPortal=${selPortal ?? "null"} selBrandId=${selBrandId ?? "null"} routeBrandId=${isBrandScoped ? routeBrandId : "null"} decision=${decision === "allow" ? "allow" : "deny"} reason=${reason}`
  );

  if (!selPortal) {
    return res.status(409).json({ error: "Portal not selected" });
  }
  if (selPortal !== "brand") {
    return res.status(403).json({ error: "Wrong portal" });
  }
  if (isBrandScoped && !selBrandId) {
    return res.status(409).json({ error: "Portal not selected" });
  }
  if (isBrandScoped && selBrandId !== routeBrandId) {
    return res.status(403).json({ error: "Wrong portal", detail: "brand mismatch" });
  }

  return next();
};
