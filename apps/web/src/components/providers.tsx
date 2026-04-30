"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { ReactNode, useEffect } from "react";
import { ToastProvider } from "./toast";
import { sepolia } from "viem/chains";
import { PortalProvider } from "@/lib/portal";

export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  useEffect(() => {
    if (!appId) {
      console.warn("NEXT_PUBLIC_PRIVY_APP_ID is not set. Privy will be disabled.");
    }
  }, [appId]);

  if (!appId) {
    return (
      <ToastProvider>
        <PortalProvider>{children}</PortalProvider>
      </ToastProvider>
    );
  }

  return (
    <PrivyProvider
      appId={appId || "missing-app-id"}
      config={{
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
          showWalletUIs: true,
        },
        supportedChains: [sepolia],
        defaultChain: sepolia,
      }}
    >
      <ToastProvider>
        <PortalProvider>{children}</PortalProvider>
      </ToastProvider>
    </PrivyProvider>
  );
}
