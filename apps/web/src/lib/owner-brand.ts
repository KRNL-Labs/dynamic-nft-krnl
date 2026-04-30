export const OWNER_BRAND_STORAGE_KEY = "ownerBrandId";
export const OWNER_BRAND_STORAGE_KEY_V2 = "selectedOwnerBrandId";
export const LEGACY_OWNER_BRAND_STORAGE_KEY = "ownerSelectedBrandId";

export function getOwnerSelectedBrandId(): string | null {
  if (typeof window === "undefined") return null;
  const current = window.localStorage.getItem(OWNER_BRAND_STORAGE_KEY);
  if (current) return current;

  const v2 = window.localStorage.getItem(OWNER_BRAND_STORAGE_KEY_V2);
  if (v2) {
    window.localStorage.setItem(OWNER_BRAND_STORAGE_KEY, v2);
    return v2;
  }

  const legacy = window.localStorage.getItem(LEGACY_OWNER_BRAND_STORAGE_KEY);
  if (legacy) {
    window.localStorage.setItem(OWNER_BRAND_STORAGE_KEY, legacy);
    return legacy;
  }
  return null;
}

export function setOwnerSelectedBrandId(brandId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OWNER_BRAND_STORAGE_KEY, brandId);
  window.localStorage.setItem(OWNER_BRAND_STORAGE_KEY_V2, brandId);
  window.localStorage.setItem(LEGACY_OWNER_BRAND_STORAGE_KEY, brandId);
}

export function clearOwnerSelectedBrandId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OWNER_BRAND_STORAGE_KEY);
  window.localStorage.removeItem(OWNER_BRAND_STORAGE_KEY_V2);
  window.localStorage.removeItem(LEGACY_OWNER_BRAND_STORAGE_KEY);
}
