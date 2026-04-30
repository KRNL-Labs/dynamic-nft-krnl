"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useAuthContext } from "./auth";
import { client } from "./client";
import { PortalInfo } from "@/types";
import { getPortalWalletAddress } from "./portal-wallet";
import { setWalletAddressGetter } from "./wallet";
import { setPortalTypeGetter, setStoredPortalType } from "./portal-state";
import {
  computeAppWalletAddress,
  getStoredAppWallet,
  setStoredAppWallet,
  clearStoredAppWallet,
} from "./app-wallet";
import { clearSWRCache } from "./swr-cache";

type PortalContextValue = {
  portalType: PortalInfo["portalType"];
  brandId: string | null;
  portalReady: boolean;
  lastLoadedAt: number | null;
  lastMeCallAt: number | null;
  meCallCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<PortalInfo | null>;
  ensurePortal: (portalType: "brand" | "owner", brandId?: string) => Promise<PortalInfo>;
  selectPortal: (payload: {
    portalType: "brand" | "owner";
    brandId?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthContext();
  const [portalType, setPortalType] = useState<PortalInfo["portalType"]>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [lastMeCallAt, setLastMeCallAt] = useState<number | null>(null);
  const [meCallCount, setMeCallCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<PortalInfo> | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  const appWalletAddress = useMemo(() => {
    const stored = getStoredAppWallet(auth.userId ?? null);
    return computeAppWalletAddress(
      auth.wallets,
      auth.walletAddress,
      stored,
    );
  }, [auth.userId, auth.walletAddress, auth.wallets]);

  useEffect(() => {
    if (!auth.userId) return;
    if (!appWalletAddress) return;
    setStoredAppWallet(auth.userId, appWalletAddress);
  }, [appWalletAddress, auth.userId]);

  const applyServerPortal = useCallback((data?: PortalInfo | null, ready = false) => {
    setPortalType(data?.portalType ?? null);
    setBrandId(data?.brandId ?? null);
    setPortalReady(Boolean(ready && data?.portalType));
    if (ready && data?.portalType) {
      setLastLoadedAt(Date.now());
    }
  }, []);

  const getAuthMeWithStats = useCallback(async () => {
    const now = Date.now();
    setLastMeCallAt(now);
    setMeCallCount((count) => count + 1);
    return client.getAuthMe();
  }, []);

  const refresh = useCallback(async () => {
    if (!auth.isAuthenticated) {
      applyServerPortal(null, false);
      setError(null);
      return null;
    }
    if (!appWalletAddress) {
      applyServerPortal(null, false);
      setError(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getAuthMeWithStats();
      applyServerPortal(data, true);
      return data;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load portal state";
      setError(msg);
      applyServerPortal(null, false);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applyServerPortal, appWalletAddress, auth.isAuthenticated, getAuthMeWithStats]);

  const ensurePortal = useCallback(
    async (desiredPortal: "brand" | "owner", desiredBrandId?: string) => {
      if (!auth.isAuthenticated) {
        const msg = "Not authenticated";
        setError(msg);
        throw new Error(msg);
      }
      if (!appWalletAddress) {
        const msg = "Wallet required";
        setError(msg);
        throw new Error(msg);
      }
      const key = `${desiredPortal}:${desiredBrandId ?? ""}`;
      if (inFlightRef.current && lastKeyRef.current === key) {
        return inFlightRef.current;
      }
      const portalWallet = getPortalWalletAddress(
        desiredPortal,
        auth.wallets,
        auth.walletAddress,
      );
      if (!portalWallet) {
        const msg = "Wallet required";
        setError(msg);
        throw new Error(msg);
      }
      const run = (async () => {
        setLoading(true);
        setError(null);
        try {
          const current = await getAuthMeWithStats();
          const currentPortal = current.portalType ?? null;
          const currentBrand = current.brandId ?? null;
          const needsSelect =
            !currentPortal ||
            currentPortal !== desiredPortal ||
            (desiredPortal === "brand" &&
              desiredBrandId &&
              currentBrand !== desiredBrandId);
          if (needsSelect) {
            const payload =
              desiredPortal === "brand" && desiredBrandId
                ? { portalType: "brand" as const, brandId: desiredBrandId }
                : { portalType: desiredPortal };
            if (process.env.NODE_ENV !== "production") {
              console.log("[select-portal] sending", payload);
            }
            await client.selectPortal(payload);
          }
          const confirmed = await getAuthMeWithStats();
          applyServerPortal(confirmed, true);
          const confirmedPortal = confirmed.portalType ?? null;
          const confirmedBrand = confirmed.brandId ?? null;
          if (
            confirmedPortal !== desiredPortal ||
            (desiredPortal === "brand" &&
              desiredBrandId &&
              confirmedBrand !== desiredBrandId)
          ) {
            throw new Error("Portal selection did not persist on server");
          }
          if (process.env.NODE_ENV !== "production") {
            console.log("[portal] confirmed", confirmed);
          }
          return confirmed;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to ensure portal";
          setError(msg);
          applyServerPortal(null, false);
          throw err;
        } finally {
          setLoading(false);
          inFlightRef.current = null;
          lastKeyRef.current = null;
        }
      })();
      inFlightRef.current = run;
      lastKeyRef.current = key;
      return run;
    },
    [
      appWalletAddress,
      auth.isAuthenticated,
      auth.walletAddress,
      auth.wallets,
      applyServerPortal,
      getAuthMeWithStats,
    ],
  );

  const selectPortal = useCallback(
    async (payload: { portalType: "brand" | "owner"; brandId?: string }) => {
      await ensurePortal(payload.portalType, payload.brandId);
    },
    [ensurePortal],
  );

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.isAuthenticated) {
      applyServerPortal(null, false);
      setError(null);
      setLoading(false);
      return;
    }
    if (!appWalletAddress) {
      applyServerPortal(null, false);
      setError(null);
      setLoading(false);
    }
  }, [appWalletAddress, auth.isAuthenticated, auth.ready, applyServerPortal]);

  useEffect(() => {
    setStoredPortalType(portalType ?? null);
  }, [portalType]);

  const walletGetter = useCallback(() => {
    if (!auth.isAuthenticated) return null;
    return appWalletAddress ?? null;
  }, [appWalletAddress, auth.isAuthenticated]);

  useEffect(() => {
    setWalletAddressGetter(walletGetter);
    return () => {
      setWalletAddressGetter(null);
    };
  }, [walletGetter]);

  useEffect(() => {
    setPortalTypeGetter(() => portalType ?? null);
    return () => {
      setPortalTypeGetter(null);
    };
  }, [portalType]);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await client.logout();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[portal] logout backend failed", err);
      }
    }
    try {
      await auth.logout();
    } finally {
      applyServerPortal(null, false);
      setStoredPortalType(null);
      clearStoredAppWallet(auth.userId ?? null);
      clearSWRCache();
      setLastLoadedAt(null);
      setLastMeCallAt(null);
      setMeCallCount(0);
      setLoading(false);
    }
  }, [applyServerPortal, auth.logout, auth.userId]);

  const value = useMemo(
    () => ({
      portalType,
      brandId,
      portalReady,
      lastLoadedAt,
      lastMeCallAt,
      meCallCount,
      loading,
      error,
      refresh,
      ensurePortal,
      selectPortal,
      logout,
    }),
    [
      portalType,
      brandId,
      portalReady,
      lastLoadedAt,
      lastMeCallAt,
      meCallCount,
      loading,
      error,
      refresh,
      ensurePortal,
      selectPortal,
      logout,
    ],
  );

  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  );
}

export function usePortalContext() {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortalContext must be used within PortalProvider");
  }
  return context;
}
