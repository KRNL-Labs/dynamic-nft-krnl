export type RewardXpMode = "ZEALY" | "OVERRIDE" | "NONE";

export type EffectiveRewardRule = {
  enabled: boolean;
  lootKeysDelta: number;
  xpMode: RewardXpMode;
  xpOverride: number | null;
};

const REWARD_XP_MODES: RewardXpMode[] = ["ZEALY", "OVERRIDE", "NONE"];

export const normalizeXpMode = (value: unknown): RewardXpMode | null => {
  const normalized = String(value || "ZEALY").toUpperCase();
  if (REWARD_XP_MODES.includes(normalized as RewardXpMode)) {
    return normalized as RewardXpMode;
  }
  return null;
};

export const normalizeNonNegativeInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

export const resolveXpOverride = (xpMode: RewardXpMode, value: unknown): number | null => {
  if (xpMode !== "OVERRIDE") {
    return null;
  }
  return normalizeNonNegativeInt(value);
};

export const computeWebhookCredits = (args: {
  rule: EffectiveRewardRule;
  zealyXp: number;
}) => {
  const zealyXp = Math.max(0, Math.floor(Number(args.zealyXp || 0)));
  if (!args.rule.enabled) {
    return {
      creditedXp: 0,
      creditedLootKeys: 0
    };
  }

  let creditedXp = 0;
  if (args.rule.xpMode === "ZEALY") {
    creditedXp = zealyXp;
  } else if (args.rule.xpMode === "OVERRIDE") {
    creditedXp = Math.max(0, Math.floor(Number(args.rule.xpOverride || 0)));
  }

  return {
    creditedXp,
    creditedLootKeys: Math.max(0, Math.floor(Number(args.rule.lootKeysDelta || 0)))
  };
};
