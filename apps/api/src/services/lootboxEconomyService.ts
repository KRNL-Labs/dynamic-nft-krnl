export const resolveDefaultXpPerLootKey = (): number => {
  const candidates = [
    process.env.XP_PRICE_PER_LOOTKEY,
    process.env.XP_PER_LOOTKEY,
    "100"
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  return 100;
};

export const buildZealyJoinUrl = (communityId: string): string => {
  const safe = String(communityId || "").trim();
  if (!safe) return "https://zealy.io";
  return `https://zealy.io/c/${safe}`;
};

export const calculatePurchaseXpRequired = (quantity: number, xpPerLootKey: number): number => {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity)));
  const safeXpPerLootKey = Math.max(1, Math.floor(Number(xpPerLootKey)));
  return safeQuantity * safeXpPerLootKey;
};

export const calculateXpAvailable = (zealyXpTotal: number, xpSpent: number): number => {
  const safeTotal = Math.max(0, Math.floor(Number(zealyXpTotal)));
  const safeSpent = Math.max(0, Math.floor(Number(xpSpent)));
  return Math.max(0, safeTotal - safeSpent);
};
