"use client";

import { WalletLike } from "./portal-wallet";

const STORAGE_PREFIX = "appWallet:";

function normalizeAddress(address?: string | null): string | null {
  if (!address) return null;
  return address.toLowerCase();
}

function isEmbeddedWallet(wallet: WalletLike): boolean {
  const clientType = wallet.walletClientType?.toLowerCase() ?? "";
  const connectorType = wallet.connectorType?.toLowerCase() ?? "";
  return (
    clientType === "privy" ||
    connectorType === "embedded" ||
    connectorType.includes("embedded")
  );
}

function isInjectedWallet(wallet: WalletLike): boolean {
  const clientType = wallet.walletClientType?.toLowerCase() ?? "";
  const connectorType = wallet.connectorType?.toLowerCase() ?? "";
  const walletType = wallet.walletType?.toLowerCase() ?? "";
  return (
    connectorType.includes("injected") ||
    connectorType.includes("metamask") ||
    clientType.includes("metamask") ||
    clientType.includes("injected") ||
    walletType.includes("metamask")
  );
}

function getStorageKey(userId?: string | null): string | null {
  if (!userId) return null;
  return `${STORAGE_PREFIX}${userId}`;
}

export function getStoredAppWallet(userId?: string | null): string | null {
  if (typeof window === "undefined") return null;
  const key = getStorageKey(userId);
  if (!key) return null;
  const value = window.localStorage.getItem(key);
  return normalizeAddress(value);
}

export function setStoredAppWallet(
  userId: string | null | undefined,
  address: string | null,
) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(userId);
  if (!key) return;
  if (!address) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, normalizeAddress(address) ?? "");
}

export function clearStoredAppWallet(userId?: string | null) {
  if (typeof window === "undefined") return;
  if (userId) {
    const key = getStorageKey(userId);
    if (key) {
      window.localStorage.removeItem(key);
    }
    return;
  }
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

export function computeAppWalletAddress(
  wallets: WalletLike[] | undefined,
  activeWalletAddress?: string | null,
  storedAddress?: string | null,
): string | null {
  const list = Array.isArray(wallets) ? wallets : [];
  const injected = list.find((wallet) => isInjectedWallet(wallet));
  if (injected?.address) return normalizeAddress(injected.address);
  const embedded = list.find((wallet) => isEmbeddedWallet(wallet));
  if (embedded?.address) return normalizeAddress(embedded.address);
  const normalizedStored = normalizeAddress(storedAddress);
  if (normalizedStored) return normalizedStored;
  const active = normalizeAddress(activeWalletAddress);
  if (active) return active;
  return normalizeAddress(list[0]?.address);
}
