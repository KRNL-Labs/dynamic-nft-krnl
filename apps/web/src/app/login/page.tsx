"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuthContext } from "@/lib/auth";
import logoImg from "@/../public/images/logo.jpg";
import { setStoredPortalType } from "@/lib/portal-state";
import { usePortalBootstrap } from "@/lib/use-portal-bootstrap";

function LoginContent() {
  const auth = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const missingPrivy = !privyAppId;
  const [selecting, setSelecting] = useState<"brand" | "owner" | null>(null);
  const [pendingPortal, setPendingPortal] = useState<"brand" | "owner" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [lastRedirectAt, setLastRedirectAt] = useState<number | null>(null);
  const didSelectRef = useRef(false);
  const didRedirectRef = useRef(false);
  const bootstrap = usePortalBootstrap({ intendedPortal: pendingPortal });

  useEffect(() => {
    if (pendingPortal) return;
    const portalParam = searchParams.get("portal");
    if (portalParam === "brand" || portalParam === "owner") {
      setPendingPortal(portalParam);
    }
  }, [pendingPortal, searchParams]);

  useEffect(() => {
    if (!pendingPortal) return;
    if (!bootstrap.portalReady) return;
    if (didRedirectRef.current) return;
    if (bootstrap.serverPortalType !== pendingPortal) return;
    const targetPath =
      pendingPortal === "owner" ? "/owner/brands" : "/dashboard/brands";
    if (pathname === targetPath) {
      didRedirectRef.current = true;
      setSelecting(null);
      setPendingPortal(null);
      return;
    }
    didRedirectRef.current = true;
    const run = async () => {
      try {
        setLastRedirectAt(Date.now());
        router.replace(targetPath);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Navigation failed.";
        setError("Navigation failed. Please refresh.");
        console.error("[login] navigation failed", err);
      } finally {
        setSelecting(null);
        setPendingPortal(null);
      }
    };
    void run();
  }, [
    bootstrap.portalReady,
    bootstrap.serverPortalType,
    pendingPortal,
    pathname,
    router,
  ]);

  const handleSelectPortal = async (portalType: "brand" | "owner") => {
    if (missingPrivy) return;
    setSelecting(portalType);
    setError(null);
    setStoredPortalType(portalType);
    setPendingPortal(portalType);
    router.replace(`/login?portal=${portalType}`);
    if (!auth.isAuthenticated) {
      await auth.login();
      return;
    }
  };

  if (pendingPortal && auth.isAuthenticated && !bootstrap.portalReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-zinc-100">
        <div className="card w-full max-w-md space-y-2 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">
            Preparing your portal
          </h1>
          <p className="text-sm text-zinc-400">
            Finalizing portal selection…
          </p>
          {bootstrap.lastError && (
            <p className="text-sm text-red-200">{bootstrap.lastError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Image
              src={logoImg}
              alt="KRNL logo"
              width={64}
              height={64}
              className="rounded-lg object-cover border border-red-500/40"
              priority
            />
          </Link>
          <div>
            {/* <p className="text-xs uppercase tracking-wide text-zinc-500">
              welcome
            </p> */}
            <h1 className="text-2xl font-bold text-white">
              Dynamic NFTs
            </h1>
          </div>
        </div>

        {missingPrivy && (
          <div className="rounded-xl border border-red-600/50 bg-red-900/40 px-4 py-3 text-sm text-red-100">
            Missing NEXT_PUBLIC_PRIVY_APP_ID. Set it in your environment to enable login.
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {bootstrap.lastError && (
          <div className="rounded-xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-200">
            {bootstrap.lastError}
          </div>
        )}

        <div className="grid mt-16 gap-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => void handleSelectPortal("brand")}
            disabled={missingPrivy}
            className="group relative mx-auto flex aspect-[3/5] w-full max-w-[280px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[url('/images/brand2.jpg')] bg-cover bg-center p-6 text-left transition hover:border-red-500/40"
          >
            <span className="absolute inset-0 bg-black/60" />
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                For admins
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Brand Portal
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Manage communities, quests, rewards, and workflows.
              </p>
              {selecting === "brand" && (
                <p className="mt-3 text-xs text-zinc-400">
                  {auth.walletAddress ? "Opening…" : "Waiting for wallet…"}
                </p>
              )}
            </div>
          </button>
          <button
            type="button"
            onClick={() => void handleSelectPortal("owner")}
            disabled={missingPrivy}
            className="group relative mx-auto flex aspect-[3/5] w-full max-w-[280px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[url('/images/owner.png')] bg-cover bg-center p-6 text-left transition hover:border-red-500/40"
          >
            <span className="absolute inset-0 bg-black/60" />
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                For collectors
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                NFT Owner Portal
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Open lootboxes, manage traits, and track activity.
              </p>
              {selecting === "owner" && (
                <p className="mt-3 text-xs text-zinc-400">
                  {auth.walletAddress ? "Opening…" : "Waiting for wallet…"}
                </p>
              )}
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
