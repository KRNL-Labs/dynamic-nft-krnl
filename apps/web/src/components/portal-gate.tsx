"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { getPortalWalletAddress } from "@/lib/portal-wallet";

type PortalGateProps = {
  portal: "brand" | "owner";
  brandId?: string | null;
  children: React.ReactNode;
};

export default function PortalGate({
  portal,
  brandId,
  children,
}: PortalGateProps) {
  const auth = useAuthContext();
  const portalState = usePortalContext();
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const didSelectRef = useRef(false);
  const lastBrandIdRef = useRef<string | null>(null);
  const portalWallet = useMemo(
    () =>
      getPortalWalletAddress(portal, auth.wallets, auth.walletAddress),
    [portal, auth.walletAddress, auth.wallets],
  );

  const portalReady =
    portalState.portalReady &&
    portalState.portalType === portal &&
    (portal !== "brand" || !brandId || portalState.brandId === brandId);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.isAuthenticated) return;
    if (!portalWallet) return;
    if (portalReady) return;
    if (portal === "brand" && !brandId) {
      return;
    }
    if (portal === "brand" && brandId && lastBrandIdRef.current === brandId) {
      return;
    }
    if (didSelectRef.current) return;
    didSelectRef.current = true;
    setSelecting(true);
    setError(null);
    if (portal === "brand" && brandId) {
      lastBrandIdRef.current = brandId;
    }
    portalState
      .ensurePortal(portal, brandId ?? undefined)
      .catch((err) => {
        const msg =
          err instanceof Error ? err.message : "Failed to select portal";
        setError(msg);
        if (portal === "brand") {
          lastBrandIdRef.current = null;
        }
      })
      .finally(() => {
        setSelecting(false);
        didSelectRef.current = false;
      });
  }, [
    auth.ready,
    auth.isAuthenticated,
    portalWallet,
    portalReady,
    portal,
    brandId,
    portalState,
  ]);

  if (!auth.ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-6 text-sm text-zinc-400">Loading…</div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Login required</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Please log in to access this portal.
          </p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  if (!portalWallet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-6 text-sm text-zinc-400">
          Loading wallet…
        </div>
      </div>
    );
  }

  if (selecting || (!portalReady && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-6 text-sm text-zinc-400">
          Setting portal…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card space-y-3 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">Portal error</h1>
          <p className="text-sm text-red-200">{error}</p>
          <button
            className="btn-secondary"
            onClick={() => {
              setError(null);
              didSelectRef.current = false;
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!portalReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-6 text-sm text-zinc-400">
          Waiting for portal…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
