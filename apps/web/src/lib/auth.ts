"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useCallback } from "react";
import { setAccessTokenGetter } from "./token";

export type AuthContext = {
  userId?: string;
  walletAddress?: string;
  wallets: Array<{ address?: string; walletClientType?: string; connectorType?: string; walletType?: string }>;
  isAuthenticated: boolean;
  ready: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

type PrivyLike = {
  user?: ReturnType<typeof usePrivy>["user"];
  ready: boolean;
  authenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

function usePrivyOptional(enabled: boolean): PrivyLike {
  if (!enabled) {
    return {
      user: undefined,
      ready: true,
      authenticated: false,
      login: async () => {},
      logout: async () => {},
      getAccessToken: async () => null,
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return usePrivy();
}

function useWalletsOptional(enabled: boolean) {
  if (!enabled) {
    return { wallets: [] as Array<{ address?: string; walletClientType?: string; connectorType?: string; walletType?: string }> };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useWallets();
}

export function useAuthContext(): AuthContext {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const privyAvailable = Boolean(appId);

  const { user, ready, authenticated, login: privyLogin, logout, getAccessToken: privyGetAccessToken } =
    usePrivyOptional(privyAvailable);
  const { wallets } = useWalletsOptional(privyAvailable);

  const getAccessToken = useCallback(async () => {
    if (!privyAvailable || !ready || !authenticated) return null;
    try {
      return await privyGetAccessToken();
    } catch (err) {
      console.error("Failed to fetch access token", err);
      return null;
    }
  }, [privyAvailable, ready, authenticated, privyGetAccessToken]);

  useEffect(() => {
    setAccessTokenGetter(() => getAccessToken());
    return () => {
      setAccessTokenGetter(null);
    };
  }, [getAccessToken]);

  const walletAddress = useMemo(() => {
    if (wallets && wallets.length > 0) {
      const withAddress = wallets.find((wallet) => Boolean(wallet.address));
      if (withAddress?.address) {
        return withAddress.address;
      }
    }
    const linkedWallet = user?.linkedAccounts?.find(
      (account) => account.type === "wallet",
    );
    if (linkedWallet && "address" in linkedWallet) {
      return (linkedWallet as { address: string }).address;
    }
    return user?.wallet?.address;
  }, [user, wallets]);

  return {
    userId: privyAvailable ? user?.id ?? undefined : undefined,
    walletAddress: privyAvailable ? walletAddress ?? undefined : undefined,
    wallets,
    isAuthenticated: privyAvailable ? ready && authenticated : false,
    ready: privyAvailable ? ready : true,
    login: async () => {
      await privyLogin();
    },
    logout,
    getAccessToken,
  };
}
