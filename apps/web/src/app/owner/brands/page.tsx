"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { Brand } from "@/types";
import { useToast } from "@/components/toast";
import { setOwnerSelectedBrandId } from "@/lib/owner-brand";
import { isApiError } from "@/lib/api";

function getJoinUrl(brand: Brand): string | null {
  const url = brand.zealyJoinUrl ?? brand.joinUrl ?? brand.zealyUrl ?? null;
  return typeof url === "string" && url.trim().length > 0 ? url : null;
}

export default function OwnerBrandsPage() {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const router = useRouter();
  const toast = useToast();

  const brandsFetcher = () => client.getOwnerBrands();

  const {
    data: brandsData,
    error,
    isValidating,
  } = useSWR(
    auth.isAuthenticated &&
      auth.walletAddress &&
      portal.portalReady &&
      portal.portalType === "owner"
      ? "/api/me/brands"
      : null,
    brandsFetcher,
    { refreshInterval: 0, revalidateOnFocus: false },
  );

  const brands = useMemo<Brand[]>(() => {
    return Array.isArray(brandsData) ? brandsData : [];
  }, [brandsData]);

  const handleSelect = async (brandId?: string | null) => {
    if (!brandId) {
      toast.addToast("Missing brand id.", "error");
      return;
    }
    try {
      await client.selectOwnerBrand(brandId).catch(() => undefined);
      await client
        .selectPortal({ portalType: "owner", brandId })
        .catch(() => undefined);
      setOwnerSelectedBrandId(brandId);
      router.replace(`/owner/brand/${encodeURIComponent(brandId)}/dashboard`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to select brand";
      toast.addToast(msg, "error");
    }
  };

  const handleLogout = async () => {
    await portal.logout();
    router.push("/");
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Select Brand</h1>
          <p className="mt-2 text-sm text-zinc-400">Login to continue.</p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  const errorJoinUrl =
    isApiError(error) &&
    typeof error.body === "object" &&
    error.body &&
    "joinUrl" in error.body &&
    typeof (error.body as { joinUrl?: unknown }).joinUrl === "string"
      ? ((error.body as { joinUrl?: string }).joinUrl ?? null)
      : null;

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Owner Portal</p>
            <h1 className="text-2xl font-bold text-white">Select a Brand</h1>
            <p className="text-sm text-zinc-400">
              Choose the brand you want to interact with.
            </p>
          </div>
          {auth.isAuthenticated && (
            <button className="btn-secondary" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>

        {error && (
          <div className="card border-red-500/40 p-4 text-sm text-red-200">
            <p>
              {isApiError(error) && error.status === 400
                ? "Wallet required."
                : error instanceof Error
                  ? error.message
                  : "Failed to load brands"}
            </p>
            {isApiError(error) && error.status === 404 && errorJoinUrl && (
              <a
                href={errorJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary mt-3 inline-flex"
              >
                Join on Zealy
              </a>
            )}
          </div>
        )}

        {isValidating && (
          <div className="card p-4 text-sm text-zinc-400">Loading brands...</div>
        )}

        {!isValidating && brands.length === 0 && (
          <div className="card p-4 text-sm text-zinc-400">
            No brands available for this wallet.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {brands.map((brand) => {
            const resolvedId = brand.id ?? brand.brandId ?? "";
            const joinUrl = getJoinUrl(brand);
            return (
              <div
                key={resolvedId || brand.name}
                className="card flex items-center justify-between gap-4 p-4 text-left hover:border-red-500/40"
              >
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Brand</p>
                  <h3 className="text-lg font-semibold text-white">
                    {brand.name ?? "Unnamed brand"}
                  </h3>
                  {brand.description && (
                    <p className="text-sm text-zinc-400">{brand.description}</p>
                  )}
                  {joinUrl && (
                    <span className="inline-flex rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      Zealy available
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void handleSelect(resolvedId)}
                  >
                    Open
                  </button>
                  {joinUrl && (
                    <a
                      href={joinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                    >
                      Join on Zealy
                    </a>
                  )}
                  {brand.logoUrl && (
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={brand.logoUrl}
                        alt={brand.name ?? "Brand logo"}
                        className="h-full w-full object-contain"
                    />
                  </div>
                )}
              </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
