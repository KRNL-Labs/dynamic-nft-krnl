export type LootTableEntry = {
  traitName: string;
  traitValue: string;
  weight: number;
};

export const normalizeLootTableEntries = (input: unknown): LootTableEntry[] => {
  const payload = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];

  const entries: LootTableEntry[] = [];
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const traitName = String(record.traitName ?? "").trim();
    const traitValue = String(record.traitValue ?? "").trim();
    const weight = Number(record.weight);
    if (!traitName || !traitValue) continue;
    if (!Number.isFinite(weight) || !Number.isInteger(weight) || weight < 1) continue;
    entries.push({ traitName, traitValue, weight });
  }

  return entries;
};

export const sampleWeightedLootEntries = (args: {
  entries: LootTableEntry[];
  count: number;
  excludedKeys?: Set<string>;
  maxAttempts?: number;
  random?: () => number;
}): LootTableEntry[] => {
  const { entries } = args;
  const count = Math.max(0, Math.floor(args.count));
  if (count === 0 || entries.length === 0) {
    return [];
  }

  const random = args.random || Math.random;
  const excluded = args.excludedKeys ?? new Set<string>();
  const pickedKeys = new Set<string>();
  const picked: LootTableEntry[] = [];
  const maxAttempts = Math.max(
    args.maxAttempts ?? 0,
    Math.max(20, entries.length * count * 5)
  );

  const pickOne = (): LootTableEntry | null => {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return null;
    let roll = Math.floor(random() * totalWeight);
    for (const entry of entries) {
      if (roll < entry.weight) return entry;
      roll -= entry.weight;
    }
    return entries[entries.length - 1] ?? null;
  };

  let attempts = 0;
  while (picked.length < count && attempts < maxAttempts) {
    attempts += 1;
    const selected = pickOne();
    if (!selected) break;

    const key = `${selected.traitName}::${selected.traitValue}`;
    if (excluded.has(key) || pickedKeys.has(key)) {
      continue;
    }

    pickedKeys.add(key);
    picked.push(selected);
  }

  return picked;
};
