"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { PortalInfo } from "@/types";

type BootstrapState = {
  portalReady: boolean;
  serverPortalType: PortalInfo["portalType"] | null;
  serverBrandId: string | null;
  lastError: string | null;
  authReady: boolean;
  intendedPortal: "brand" | "owner" | null;
};

let bootstrapDone = false;
let lastBootstrapPortal: "brand" | "owner" | null = null;

export function usePortalBootstrap({
  intendedPortal,
}: {
  intendedPortal: "brand" | "owner" | null;
}): BootstrapState {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const didRunRef = useRef(false);
  const [portalReady, setPortalReady] = useState(false);
  const [serverPortal, setServerPortal] = useState<PortalInfo | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    didRunRef.current = false;
    setPortalReady(false);
    setServerPortal(null);
    setLastError(null);
  }, [intendedPortal]);

  useEffect(() => {
    if (auth.isAuthenticated) return;
    bootstrapDone = false;
    lastBootstrapPortal = null;
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (!intendedPortal) return;
    if (bootstrapDone && lastBootstrapPortal === intendedPortal) {
      setPortalReady(portal.portalReady && portal.portalType === intendedPortal);
      setServerPortal({
        portalType: portal.portalType ?? null,
        brandId: portal.brandId ?? null,
      });
      return;
    }
    if (!auth.ready || !auth.isAuthenticated) return;
    if (!auth.walletAddress) return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    const run = async () => {
      try {
        setLastError(null);
        const data = await portal.ensurePortal(intendedPortal);
        setServerPortal(data);
        setPortalReady(true);
        bootstrapDone = true;
        lastBootstrapPortal = intendedPortal;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to bootstrap portal";
        setLastError(msg);
        setPortalReady(false);
      }
    };

    void run();
  }, [
    auth.isAuthenticated,
    auth.ready,
    auth.walletAddress,
    intendedPortal,
    portal,
  ]);

  return {
    portalReady,
    serverPortalType: serverPortal?.portalType ?? null,
    serverBrandId: serverPortal?.brandId ?? null,
    lastError,
    authReady: auth.ready,
    intendedPortal,
  };
}
