"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { getPortalWalletAddress } from "@/lib/portal-wallet";

type Props = {
  expected: "brand" | "owner";
  children: React.ReactNode;
};

export default function PortalGuard({ expected, children }: Props) {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const router = useRouter();
  const portalWallet = useMemo(
    () => getPortalWalletAddress(expected, auth.wallets, auth.walletAddress),
    [expected, auth.walletAddress, auth.wallets],
  );
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (!portalWallet) return;
    if (portal.loading) return;
    if (!portal.portalReady) {
      return;
    }
    if (!portal.portalType) {
      router.replace("/select-portal");
    }
  }, [
    auth.isAuthenticated,
    portalWallet,
    expected,
    portal,
    router,
    portal.loading,
    portal.portalReady,
    portal.portalType,
  ]);

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
        <div className="card p-6 text-center text-sm text-zinc-400">
          Loading wallet…
        </div>
      </div>
    );
  }

  if (portal.loading || !portal.portalReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-6 text-sm text-zinc-400">Loading portal…</div>
      </div>
    );
  }

  if (!portal.portalType) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">
            Portal not selected
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Choose a portal to continue.
          </p>
          <Link href="/select-portal" className="btn-primary mt-4 inline-flex">
            Select portal
          </Link>
        </div>
      </div>
    );
  }

  if (portal.portalType !== expected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card space-y-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-white">
            Wrong portal selected
          </h1>
          <p className="text-sm text-zinc-400">
            You’re currently in the {portal.portalType} portal.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/select-portal?portal=brand"
              className="btn-secondary"
            >
              Switch to Brand
            </Link>
            <Link
              href="/select-portal?portal=owner"
              className="btn-primary"
            >
              Switch to Owner
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
