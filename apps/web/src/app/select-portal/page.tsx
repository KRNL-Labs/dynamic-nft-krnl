"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { useToast } from "@/components/toast";
import logoImg from "@/../public/images/logo.jpg";
import { setStoredPortalType } from "@/lib/portal-state";

type PortalType = "brand" | "owner";

function SelectPortalContent() {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPortal = (searchParams.get("portal") as PortalType | null) ?? null;
  const [selectedPortal, setSelectedPortal] = useState<PortalType | null>(
    initialPortal,
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.isAuthenticated) {
      router.replace("/login");
      return;
    }
  }, [auth.isAuthenticated, auth.ready, router]);

  const handleSelectPortal = async (portalType: PortalType) => {
    if (!auth.walletAddress) {
      toast.addToast("Waiting for wallet connection...", "error");
      return;
    }
    if (!auth.isAuthenticated) {
      await auth.login();
    }
    setSelectedPortal(portalType);
    setStoredPortalType(portalType);
    if (portalType === "owner") {
      setSubmitting(true);
      try {
        await portal.ensurePortal("owner");
        router.replace("/owner/brands");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to select owner portal";
        toast.addToast(msg, "error");
      } finally {
        setSubmitting(false);
      }
    }
  };
  const handleSelectBrandPortal = async () => {
    if (!auth.walletAddress) {
      toast.addToast("Waiting for wallet connection...", "error");
      return;
    }
    setSelectedPortal("brand");
    setStoredPortalType("brand");
    setSubmitting(true);
    try {
      await portal.ensurePortal("brand");
      router.replace("/dashboard/brands");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to select brand portal";
      toast.addToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Image
              src={logoImg}
              alt="KRNL logo"
              width={44}
              height={44}
              className="rounded-lg object-cover border border-red-500/40"
              priority
            />
          </Link>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Portal selection
            </p>
            <h1 className="text-2xl font-bold text-white">
              Choose your workspace
            </h1>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => void handleSelectBrandPortal()}
            className={`group rounded-2xl border bg-gradient-to-br p-6 text-left transition ${
              selectedPortal === "brand"
                ? "border-red-500/70 from-red-600/20 to-zinc-900"
                : "border-zinc-800 from-zinc-900/60 to-zinc-950 hover:border-red-500/40"
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              For admins
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Brand Portal
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Manage quests, rewards, assets, and workflows.
            </p>
          </button>
          <button
            type="button"
            onClick={() => void handleSelectPortal("owner")}
            className={`group rounded-2xl border bg-gradient-to-br p-6 text-left transition ${
              selectedPortal === "owner"
                ? "border-red-500/70 from-red-600/20 to-zinc-900"
                : "border-zinc-800 from-zinc-900/60 to-zinc-950 hover:border-red-500/40"
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              For collectors
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              NFT Owner Portal
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Open lootboxes, manage traits, and track rewards.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SelectPortalPage() {
  return (
    <Suspense fallback={null}>
      <SelectPortalContent />
    </Suspense>
  );
}
