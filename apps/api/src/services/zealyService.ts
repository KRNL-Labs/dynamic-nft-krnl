import { Prisma } from "@prisma/client";
import { Request } from "express";
import { prisma } from "../db";

export interface ZealyQuest {
  zealyQuestId: string;
  title: string;
  description?: string;
  xpReward?: number;
  active?: boolean;
}

export interface ZealyWebhookEvent {
  subdomain: string;
  questId: string;
  zealyUserId?: string;
  wallet?: string;
  status: string;
  raw: Prisma.InputJsonValue;
}

export class ZealyConfigError extends Error {
  constructor(message = "Zealy config missing") {
    super(message);
    this.name = "ZealyConfigError";
  }
}

export class ZealyApiError extends Error {
  constructor(message = "Zealy API failed") {
    super(message);
    this.name = "ZealyApiError";
  }
}

const getZealyApiKeyByCommunityId = async (communityId: string) => {
  const connection = await prisma.zealyConnection.findFirst({
    where: { communityId }
  });
  if (!connection?.apiKey) {
    throw new ZealyConfigError("Brand missing Zealy config");
  }
  return connection.apiKey;
};

export const getZealyConfigForBrand = async (brandId: string) => {
  const connection = await prisma.zealyConnection.findFirst({
    where: { brandId }
  });

  if (!connection) {
    throw new ZealyConfigError("Zealy config not found for brand");
  }

  return {
    communityId: connection.communityId,
    apiKey: connection.apiKey,
    webhookSecret: connection.webhookSecret ?? null,
    zealySubdomain: connection.communityId,
    zealyApiKey: connection.apiKey
  };
};

export const fetchQuests = async (args: {
  subdomain: string;
  apiKey: string;
}): Promise<ZealyQuest[]> => {
  if (process.env.ZEALY_INSECURE_TLS === "1") {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      if (process.env.NODE_ENV !== "production") {
        console.warn("[zealy] TLS verification disabled via ZEALY_INSECURE_TLS=1");
      }
    }
  }
  const baseUrl = process.env.ZEALY_API_BASE_URL || "https://api.zealy.io";
  const url = `${baseUrl}/communities/${args.subdomain}/quests`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": args.apiKey,
      "content-type": "application/json"
    }
  });

  if (!response.ok) {
    throw new ZealyApiError(`Zealy API failed with status ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.data)
      ? (data as any).data
      : Array.isArray((data as any)?.quests)
        ? (data as any).quests
        : [];

  if (!Array.isArray(list)) {
    throw new ZealyApiError("Zealy API returned unexpected payload");
  }

  return list
    .map((quest: any) => {
      const zealyQuestId = String(quest.id ?? quest._id ?? quest.uuid ?? "").trim();
      if (!zealyQuestId) return null;
      return {
        zealyQuestId,
        title: String(quest.title ?? quest.name ?? "Untitled Quest"),
        description: quest.description ? String(quest.description) : undefined,
        xpReward: typeof quest.xpReward === "number" ? quest.xpReward : undefined,
        active:
          typeof quest.active === "boolean"
            ? quest.active
            : typeof quest.isActive === "boolean"
              ? quest.isActive
              : undefined
      } as ZealyQuest;
    })
    .filter(Boolean) as ZealyQuest[];
};

const withInsecureTlsIfNeeded = () => {
  if (process.env.ZEALY_INSECURE_TLS === "1") {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      if (process.env.NODE_ENV !== "production") {
        console.warn("[zealy] TLS verification disabled via ZEALY_INSECURE_TLS=1");
      }
    }
  }
};

const getZealyBaseUrl = () => process.env.ZEALY_API_BASE_URL || "https://api.zealy.io";

const parseZealyUser = (payload: any) => {
  if (!payload) return null;
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.members)
        ? payload.members
        : Array.isArray(payload?.users)
          ? payload.users
          : null;
  if (Array.isArray(list) && list.length > 0) {
    return list[0];
  }
  if (payload?.id || payload?._id || payload?.userId) {
    return payload;
  }
  return null;
};

const extractXp = (user: any): number | null => {
  const candidates = [
    user?.xp,
    user?.totalXp,
    user?.xpTotal,
    user?.experience,
    user?.points
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
};

export const lookupZealyUserByWallet = async (args: {
  communityId: string;
  apiKey: string;
  walletAddress: string;
}): Promise<{ zealyUserId: string; xp: number }> => {
  withInsecureTlsIfNeeded();
  const baseUrl = getZealyBaseUrl();
  const wallet = args.walletAddress.toLowerCase();
  const candidates = [
    `${baseUrl}/communities/${args.communityId}/members?address=${wallet}`,
    `${baseUrl}/communities/${args.communityId}/users?address=${wallet}`,
    `${baseUrl}/communities/${args.communityId}/members?walletAddress=${wallet}`,
    `${baseUrl}/communities/${args.communityId}/users?walletAddress=${wallet}`
  ];

  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "x-api-key": args.apiKey, "content-type": "application/json" }
      });
      if (!response.ok) {
        lastError = new ZealyApiError(`Zealy API failed with status ${response.status}`);
        continue;
      }
      const data = await response.json();
      const user = parseZealyUser(data);
      if (!user) {
        lastError = new ZealyApiError("Zealy API returned no user");
        continue;
      }
      const zealyUserId = String(user.id ?? user._id ?? user.userId ?? "").trim();
      if (!zealyUserId) {
        lastError = new ZealyApiError("Zealy user id missing");
        continue;
      }
      const xp = extractXp(user);
      if (xp === null) {
        lastError = new ZealyApiError("Zealy user XP missing");
        continue;
      }
      return { zealyUserId, xp };
    } catch (error: any) {
      lastError = error instanceof Error ? error : new ZealyApiError("Zealy API failed");
    }
  }

  throw lastError ?? new ZealyApiError("Zealy user lookup failed");
};

export const findZealyUserByWallet = async (args: {
  communityId: string;
  apiKey: string;
  walletAddress: string;
}): Promise<{ zealyUserId: string; xp: number } | null> => {
  try {
    return await lookupZealyUserByWallet(args);
  } catch (error) {
    if (
      error instanceof ZealyApiError &&
      /no user|user id missing|user lookup failed/i.test(error.message)
    ) {
      return null;
    }
    throw error;
  }
};

export const deductZealyXp = async (args: {
  communityId: string;
  apiKey: string;
  zealyUserId: string;
  amount: number;
}) => {
  withInsecureTlsIfNeeded();
  const baseUrl = getZealyBaseUrl();
  const amount = Math.max(0, Math.floor(args.amount));
  const bodies = [
    { delta: -amount },
    { amount: -amount },
    { xpDelta: -amount },
    { points: -amount }
  ];
  const paths = [
    `/communities/${args.communityId}/members/${args.zealyUserId}/xp`,
    `/communities/${args.communityId}/users/${args.zealyUserId}/xp`,
    `/communities/${args.communityId}/members/${args.zealyUserId}/points`,
    `/communities/${args.communityId}/users/${args.zealyUserId}/points`
  ];

  let lastError: Error | null = null;
  for (const path of paths) {
    for (const body of bodies) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "x-api-key": args.apiKey, "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        if (response.ok) {
          return;
        }
        lastError = new ZealyApiError(`Zealy API failed with status ${response.status}`);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new ZealyApiError("Zealy API failed");
      }
    }
  }

  throw lastError ?? new ZealyApiError("Zealy XP deduction failed");
};

export const lookupUserByWallet = async (communityId: string, walletAddress: string) => {
  const apiKey = await getZealyApiKeyByCommunityId(communityId);
  return lookupZealyUserByWallet({
    communityId,
    apiKey,
    walletAddress
  });
};

export const removeXp = async (communityId: string, zealyUserId: string, amount: number) => {
  const apiKey = await getZealyApiKeyByCommunityId(communityId);
  return deductZealyXp({
    communityId,
    apiKey,
    zealyUserId,
    amount
  });
};

export const syncZealyQuests = async (brandId: string) => {
  const config = await getZealyConfigForBrand(brandId);

  const zealyQuests = await fetchQuests({
    subdomain: config.communityId,
    apiKey: config.apiKey
  });

  await Promise.all(
    zealyQuests.map((quest) =>
      prisma.zealyQuest.upsert({
        where: {
          brandId_zealyQuestId: {
            brandId,
            zealyQuestId: quest.zealyQuestId
          }
        },
        update: {
          title: quest.title,
          description: quest.description,
          xp: quest.xpReward ?? null,
          status: quest.active === undefined ? undefined : quest.active ? "active" : "inactive",
          rawJson: quest as unknown as Prisma.InputJsonValue
        },
        create: {
          brandId,
          zealyQuestId: quest.zealyQuestId,
          title: quest.title,
          description: quest.description,
          xp: quest.xpReward ?? null,
          status: quest.active === undefined ? null : quest.active ? "active" : "inactive",
          rawJson: quest as unknown as Prisma.InputJsonValue
        }
      })
    )
  );

  // Keep legacy Quest table in sync for downstream consumers.
  await Promise.all(
    zealyQuests.map((quest) =>
      prisma.quest.upsert({
        where: {
          brandId_zealyQuestId: {
            brandId,
            zealyQuestId: quest.zealyQuestId
          }
        },
        update: {
          title: quest.title,
          description: quest.description,
          xpReward: quest.xpReward ?? 0,
          active: quest.active ?? true
        },
        create: {
          brandId,
          zealyQuestId: quest.zealyQuestId,
          title: quest.title,
          description: quest.description,
          xpReward: quest.xpReward ?? 0,
          active: quest.active ?? true
        }
      })
    )
  );

  return zealyQuests.length;
};

export const normalizeZealyWebhookPayload = (req: Request<any, any, any>): ZealyWebhookEvent => {
  const body = req.body as Record<string, unknown>;
  return {
    subdomain: String(body.subdomain ?? body.zealySubdomain ?? ""),
    questId: String(body.questId ?? body.zealyQuestId ?? ""),
    zealyUserId: body.userId ? String(body.userId) : undefined,
    wallet: body.wallet ? String(body.wallet) : undefined,
    status: String(body.status ?? body.event ?? "unknown"),
    raw: body as Prisma.InputJsonValue
  };
};

export const verifyZealyWebhookSignature = (
  _event: ZealyWebhookEvent,
  _req: Request<any, any, any>
): boolean => {
  // TODO: Implement webhook signature verification using zealyWebhookSecret.
  return true;
};
