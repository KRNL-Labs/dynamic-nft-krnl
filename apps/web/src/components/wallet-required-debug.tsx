"use client";

import { useEffect, useState } from "react";
import { useAuthContext } from "@/lib/auth";

type Props = {
  onRefresh?: () => void;
};

export default function WalletRequiredDebug({ onRefresh }: Props) {
  const auth = useAuthContext();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const token = await auth.getAccessToken();
        if (active) {
          setHasToken(Boolean(token));
        }
      } catch {
        if (active) {
          setHasToken(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [auth]);

  return (
    <div className="space-y-3 text-xs text-zinc-300">
      <p className="text-sm text-red-200">No active wallet selected.</p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Debug
        </p>
        <div className="mt-2 space-y-1">
          <div>
            <span className="text-zinc-500">Token present:</span>{" "}
            <span className="text-zinc-200">
              {hasToken === null ? "Checking…" : hasToken ? "Yes" : "No"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Wallet address:</span>{" "}
            <span className="text-zinc-200">
              {auth.walletAddress ?? "Missing"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Authorization header:</span>{" "}
            <span className="text-zinc-200">
              {hasToken ? "Bearer (present)" : "Missing"}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">X-Wallet-Address header:</span>{" "}
            <span className="text-zinc-200">
              {auth.walletAddress ?? "Missing"}
            </span>
          </div>
        </div>
      </div>
      {onRefresh && (
        <button className="btn-secondary" onClick={onRefresh}>
          Refresh wallet
        </button>
      )}
    </div>
  );
}
