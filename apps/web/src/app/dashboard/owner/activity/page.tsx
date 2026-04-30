"use client";

import { useEffect } from "react";
import { useAuthContext } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { getOwnerSelectedBrandId } from "@/lib/owner-brand";

export default function OwnerActivityPage() {
  const auth = useAuthContext();
  const router = useRouter();

  const selectedBrandId = getOwnerSelectedBrandId();

  useEffect(() => {
    if (!selectedBrandId) {
      router.replace("/owner/brands");
    }
  }, [router, selectedBrandId]);

  if (!auth.isAuthenticated) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Activity</h1>
        <p className="mt-2 text-sm text-zinc-400">Login to view your activity.</p>
        <button onClick={auth.login} className="btn-primary mt-4">
          Login
        </button>
      </div>
    );
  }

  if (!selectedBrandId) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Select a brand</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Choose a brand to continue in the owner portal.
        </p>
        <button
          onClick={() => router.replace("/owner/brands")}
          className="btn-primary mt-4"
        >
          Select brand
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Activity</p>
        <h1 className="text-2xl font-bold text-white">Owner Activity</h1>
        <p className="text-sm text-zinc-400">
          Workflow run details are available in the Brand Portal.
        </p>
      </div>
      <div className="card p-4 text-sm text-zinc-300">
        Use your brand dashboard to manage XP, lootkeys, lootbox opens, and active traits.
      </div>
    </div>
  );
}
