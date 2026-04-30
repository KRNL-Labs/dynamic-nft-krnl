"use client";

import { useMemo } from "react";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import {
  describeWallet,
  getPortalWalletAddress,
} from "@/lib/portal-wallet";
import { computeAppWalletAddress, getStoredAppWallet } from "@/lib/app-wallet";

export default function PortalWalletDebug() {
  const auth = useAuthContext();
  const portal = usePortalContext();

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const portalWallet = useMemo(
    () =>
      getPortalWalletAddress(portal.portalType ?? null, auth.wallets, auth.walletAddress),
    [portal.portalType, auth.wallets, auth.walletAddress],
  );
  const storedAppWallet = useMemo(
    () => getStoredAppWallet(auth.userId ?? null),
    [auth.userId],
  );
  const appWallet = useMemo(
    () =>
      computeAppWalletAddress(
        auth.wallets,
        auth.walletAddress,
        storedAppWallet,
      ),
    [auth.walletAddress, auth.wallets, storedAppWallet],
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-xs text-zinc-200 shadow-lg">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
        Portal Debug
      </p>
      <div className="mt-2 space-y-1">
        <div>
          <span className="text-zinc-500">Server portal:</span>{" "}
          <span className="text-zinc-100">{portal.portalType ?? "—"}</span>
        </div>
        <div>
          <span className="text-zinc-500">Portal ready:</span>{" "}
          <span className="text-zinc-100">{portal.portalReady ? "yes" : "no"}</span>
        </div>
        <div>
          <span className="text-zinc-500">Last me call:</span>{" "}
          <span className="text-zinc-100">{portal.lastMeCallAt ?? "—"}</span>
        </div>
        <div>
          <span className="text-zinc-500">Me call count:</span>{" "}
          <span className="text-zinc-100">{portal.meCallCount}</span>
        </div>
        <div>
          <span className="text-zinc-500">Last loaded:</span>{" "}
          <span className="text-zinc-100">{portal.lastLoadedAt ?? "—"}</span>
        </div>
        <div>
          <span className="text-zinc-500">Server brandId:</span>{" "}
          <span className="text-zinc-100">{portal.brandId ?? "—"}</span>
        </div>
        <div>
          <span className="text-zinc-500">Selected wallet:</span>{" "}
          <span className="text-zinc-100">{portalWallet ?? "—"}</span>
        </div>
        <div>
          <span className="text-zinc-500">App wallet:</span>{" "}
          <span className="text-zinc-100">{appWallet ?? "—"}</span>
        </div>
        <div>
          <span className="text-zinc-500">Active wallet:</span>{" "}
          <span className="text-zinc-100">
            {auth.walletAddress ?? "—"}
          </span>
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500">
          Wallets detected
        </div>
        <div className="space-y-1">
          {(auth.wallets ?? []).length === 0 && (
            <div className="text-zinc-500">None</div>
          )}
          {(auth.wallets ?? []).map((wallet, index) => {
            const info = describeWallet(wallet);
            return (
              <div
                key={`${info.address}-${index}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2"
              >
                <div className="break-all text-zinc-100">
                  {info.address}
                </div>
                <div className="text-zinc-500">
                  client: {info.walletClientType}
                </div>
                <div className="text-zinc-500">
                  connector: {info.connectorType}
                </div>
                <div className="text-zinc-500">
                  type: {info.walletType}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
