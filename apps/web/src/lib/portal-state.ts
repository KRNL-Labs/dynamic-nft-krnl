"use client";

export type PortalType = "brand" | "owner";

let portalTypeGetter: (() => PortalType | null) | null = null;

export function setPortalTypeGetter(fn: (() => PortalType | null) | null) {
  portalTypeGetter = fn;
}

export function getPortalType(): PortalType | null {
  if (portalTypeGetter) {
    return portalTypeGetter();
  }
  return null;
}

export function setStoredPortalType(portalType: PortalType | null) {
  if (typeof window === "undefined") return;
  if (!portalType) {
    window.localStorage.removeItem("portalType");
    return;
  }
  window.localStorage.setItem("portalType", portalType);
}
