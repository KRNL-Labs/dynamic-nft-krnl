"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getOwnerSelectedBrandId, setOwnerSelectedBrandId } from "@/lib/owner-brand";

function OwnerDashboardRouteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const queryBrandId = searchParams.get("brandId")?.trim() ?? "";
    const storedBrandId = getOwnerSelectedBrandId();
    const resolvedBrandId = queryBrandId || storedBrandId || "";

    if (!resolvedBrandId) {
      router.replace("/owner/brands");
      return;
    }

    setOwnerSelectedBrandId(resolvedBrandId);
    router.replace(`/owner/brand/${encodeURIComponent(resolvedBrandId)}/dashboard`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="card p-6 text-sm text-zinc-400">Loading dashboard…</div>
    </div>
  );
}

export default function OwnerDashboardRoutePage() {
  return (
    <Suspense fallback={null}>
      <OwnerDashboardRouteContent />
    </Suspense>
  );
}
