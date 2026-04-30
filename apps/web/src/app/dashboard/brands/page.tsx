"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import StatusCard from "@/components/status-card";
import { client } from "@/lib/client";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { useToast } from "@/components/toast";
import { Brand } from "@/types";
import { isApiError } from "@/lib/api";

export default function BrandsListPage() {
  const toast = useToast();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (process.env.NODE_ENV !== "production") {
    console.log("[brands] render");
  }

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[brands] mount");
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const routerRef = router as typeof router & { __debugPatched?: boolean };
    if (routerRef.__debugPatched) return;
    routerRef.__debugPatched = true;
    const originalPush = router.push.bind(router);
    const originalReplace = router.replace.bind(router);
    const originalRefresh = router.refresh.bind(router);
    router.push = (...args) => {
      console.trace("[brands] router.push", ...args);
      return originalPush(...args);
    };
    router.replace = (...args) => {
      console.trace("[brands] router.replace", ...args);
      return originalReplace(...args);
    };
    router.refresh = (...args) => {
      console.trace("[brands] router.refresh", ...args);
      return originalRefresh(...args);
    };
  }, [router]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.walletAddress) return;
    if (!portal.portalReady || portal.portalType !== "brand") return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await client.listBrands();
        setBrands(data);
      } catch (err) {
        if (isApiError(err) && err.status === 409) {
          router.replace("/select-portal");
          return;
        }
        const msg = err instanceof Error ? err.message : "Failed to load brands";
        setError(msg);
        toast.addToast(msg, "error");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [auth.isAuthenticated, auth.walletAddress, portal.portalReady, portal.portalType, router, toast]);

  const handleOpenBrand = async (brandId?: string | null) => {
    if (!brandId) {
      toast.addToast("Missing brand id. Please refresh.", "error");
      return;
    }
    if (!auth.walletAddress) {
      toast.addToast("Waiting for wallet connection...", "error");
      return;
    }
    try {
      await portal.ensurePortal("brand", brandId);
      router.push(`/dashboard/brand/${brandId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open brand";
      toast.addToast(msg, "error");
    }
  };

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Dashboard
          </p>
          <h1 className="text-2xl font-bold text-white">Your Brands</h1>
        </div>
        <Link href="/dashboard/brands/new" className="btn-primary">
          Create brand
        </Link>
      </div>

      {loading && (
        <div className="card p-4 text-sm text-zinc-400">Loading brands...</div>
      )}
      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !brands.length && (
        <div className="card p-4 text-sm text-zinc-400">
          Create your first brand.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {brands.map((brand) => {
          const resolvedId = brand.id ?? brand.brandId ?? "";
          const isMissingId = !resolvedId;
          return (
          <div
            key={resolvedId || `${brand.name}-${brand.primaryChainId ?? "brand"}`}
            className="card p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {brand.primaryChainId
                    ? `Chain ${brand.primaryChainId}`
                    : "Brand"}
                </p>
                <h3 className="text-lg font-semibold text-white">
                  {brand.name}
                </h3>
                {isMissingId && (
                  <p className="text-xs text-red-300">
                    Missing brand id. Refresh to retry.
                  </p>
                )}
                {brand.description && (
                  <p className="text-sm text-zinc-400">{brand.description}</p>
                )}
              </div>
              {brand.logoUrl && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brand.logoUrl}
                    alt={brand.name}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
            </div>
            <button
              onClick={() => void handleOpenBrand(resolvedId)}
              className="btn-secondary"
              disabled={isMissingId}
            >
              Open
            </button>
          </div>
        );
        })}
      </div>
    </div>
  );

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Brand dashboard</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to create or manage brands.
          </p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  if (!auth.walletAddress) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-6 text-center">
          <h1 className="text-xl font-semibold text-white">Wallet required</h1>
          <p className="mt-2 text-sm text-zinc-400">
            We need an active wallet to load your brands.
          </p>
          <button
            className="btn-secondary mt-4"
            onClick={() => router.refresh()}
          >
            Refresh wallet
          </button>
        </div>
      </div>
    );
  }

  return <DashboardShell brands={brands}>{content}</DashboardShell>;
}
