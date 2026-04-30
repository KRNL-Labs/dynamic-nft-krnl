export const FIXED_TRAIT_NAMES = [
  "Background",
  "Armour",
  "Aura",
  "Eyes",
  "Companion",
] as const;

export const TRAIT_RENDER_ORDER = [
  "Background",
  "Armour",
  "Aura",
  "Eyes",
  "Companion",
] as const;

export function normalizeTraitKey(value: string): string {
  return value.trim().toLowerCase();
}

