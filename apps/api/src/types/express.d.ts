import type { PrivyAuthResult } from "../services/privyService";

declare global {
  namespace Express {
    interface Request {
      auth?: PrivyAuthResult;
      portal?: {
      portalType: "brand" | "owner";
      brandId?: string | null;
      isExplicit?: boolean;
      lastWalletAddress?: string | null;
    };
  }
}
}

export {};
