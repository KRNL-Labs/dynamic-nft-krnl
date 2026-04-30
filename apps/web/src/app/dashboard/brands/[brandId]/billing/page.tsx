"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { client } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Brand } from "@/types";
import JsonViewer from "@/components/json-viewer";
import { useWallets } from "@privy-io/react-auth";
import {
  buildEip3009PaymentPayload,
  encodePaymentSignatureHeader,
  parsePaymentRequired,
} from "@/lib/x402";
import {
  ensureChain,
  getChainId,
  KRNL_CHAIN_ID,
} from "@/lib/chain";
import { apiFetchRaw } from "@/lib/api";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export default function BrandBillingPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const { wallets } = useWalletsOptional(Boolean(privyAppId));

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [walletProvider, setWalletProvider] = useState<EthereumProvider | null>(
    null,
  );

  useEffect(() => {
    const setup = async () => {
      if (!wallets || wallets.length === 0) {
        setWalletProvider(null);
        return;
      }
      const wallet = wallets[0] as {
        address?: string;
        getEthereumProvider?: () => Promise<EthereumProvider>;
      };
      if (!wallet.getEthereumProvider) {
        setWalletProvider(null);
        return;
      }
      try {
        const provider = await wallet.getEthereumProvider();
        setWalletProvider(provider);
      } catch (err) {
        console.error("Failed to initialize wallet client", err);
        setWalletProvider(null);
      }
    };
    void setup();
  }, [wallets]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandList, brandDetail, creditRes] = await Promise.all([
        client.listMyBrands(),
        client.getBrand(brandId),
        client.getCredits(brandId),
      ]);
      setBrands(brandList);
      setBrand(brandDetail);
      setCredits(creditRes.credits);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load credits";
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [brandId, toast]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.walletAddress) {
      if (!portal.portalReady || portal.portalType !== "brand") return;
      void load();
    }
  }, [auth.isAuthenticated, auth.walletAddress, portal.portalReady, portal.portalType, load]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setPaymentStatus("Requesting…");
    try {
      const url = `/api/brands/${brandId}/billing/x402/start`;

      const startResponse = await apiFetchRaw(url, {
        method: "POST",
        body: { amount },
      });

      if (startResponse.status === 402) {
        setPaymentStatus("Payment required…");

        if (!walletProvider) {
          throw new Error("Wallet not connected for payment.");
        }

        const paymentRequired = await parsePaymentRequired(startResponse);
        const accept = paymentRequired.accepts?.[0];
        if (!accept) {
          throw new Error("No acceptable payment requirements found.");
        }

        if (process.env.NODE_ENV !== "production") {
          const chainId = accept.network?.split(":")[1] ?? "unknown";
          console.debug("[x402] accept.network:", accept.network, chainId);
        }

        const currentChain = await getChainId(walletProvider);
        if (currentChain !== KRNL_CHAIN_ID) {
          toast.addToast(
            "Switching wallet to Sepolia for payment…",
            "info",
          );
          try {
            await ensureChain(walletProvider, KRNL_CHAIN_ID);
          } catch {
            throw new Error(
              "Switch wallet to Sepolia to pay.",
            );
          }
        }

        const confirmedChain = await getChainId(walletProvider);
        if (confirmedChain !== KRNL_CHAIN_ID) {
          throw new Error("Switch wallet to Sepolia to pay.");
        }

        const accounts = (await walletProvider
          .request({ method: "eth_accounts" })
          .catch(() => [])) as string[];
        const fromAddress = accounts?.[0];
        if (!fromAddress) {
          throw new Error("No wallet address available for payment.");
        }

        setPaymentStatus("Paying…");
        const payload = await buildEip3009PaymentPayload({
          accept,
          resourceUrl: url,
          fromAddress,
          provider: walletProvider,
        });
        const signatureHeader = encodePaymentSignatureHeader(payload);

        if (process.env.NODE_ENV !== "production") {
          console.debug(
            "[x402] retry sending PAYMENT-SIGNATURE header length=",
            signatureHeader.length,
          );
        }

        const retryResponse = await apiFetchRaw(url, {
          method: "POST",
          headers: {
            "PAYMENT-SIGNATURE": signatureHeader,
          },
          body: { amount },
        });

        if (process.env.NODE_ENV !== "production") {
          console.debug(
            "[x402] retry response status:",
            retryResponse.status,
          );
        }

        if (!retryResponse.ok) {
          const retryText = await retryResponse.text();
          let retryMessage = retryText;
          if (retryText) {
            try {
              const parsed = JSON.parse(retryText) as {
                reason?: string;
                error?: string;
                message?: string;
              };
              retryMessage =
                parsed.reason || parsed.error || parsed.message || retryText;
            } catch {
              retryMessage = retryText;
            }
          }
          if (retryResponse.status === 402) {
            throw new Error(retryMessage || "Payment retry failed");
          }
          throw new Error(
            retryMessage || `Payment retry failed (${retryResponse.status})`,
          );
        }

        const res = await retryResponse.json().catch(() => ({}));
        setResult(res);
      } else if (!startResponse.ok) {
        const errText = await startResponse.text();
        throw new Error(errText || "Failed to start payment");
      } else {
        const res = await startResponse.json().catch(() => ({}));
        setResult(res);
      }
      setPaymentStatus("Done");
      toast.addToast("Payment complete", "success");
      await load();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start payment";
      setPaymentStatus(null);
      setError(message);
      toast.addToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Billing</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to manage credits.
          </p>
          <button onClick={auth.login} className="btn-primary mt-4">
            Login
          </button>
        </div>
      </div>
    );
  }

  const content = (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Billing
        </p>
        <h1 className="text-2xl font-bold text-white">Credits</h1>
        <p className="text-sm text-zinc-400">
          View balance and start top-ups.
        </p>
      </div>
      {loading && (
        <div className="card p-4 text-sm text-zinc-400">Loading...</div>
      )}
      {error && (
        <div className="card border-red-500/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">Current credits</p>
          <span className="rounded-full border border-red-500/40 bg-red-600/10 px-3 py-1 text-sm font-semibold text-red-200">
            {credits ?? "—"}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          Payments happen on Sepolia.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm text-zinc-300">Amount</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="input-dark mt-2"
            />
          </div>
          <button className="btn-primary" disabled={submitting}>
            {submitting ? "Starting..." : "Start top-up"}
          </button>
          {paymentStatus && (
            <p className="text-xs text-zinc-400">{paymentStatus}</p>
          )}
        </form>
      </div>
      {result && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-semibold text-zinc-200">Payment</p>
          <JsonViewer data={result} />
        </div>
      )}
    </div>
  );

  return (
    <DashboardShell
      brands={brands}
      brandId={brandId}
      brandName={brand?.name}
      credits={credits ?? undefined}
    >
      {content}
    </DashboardShell>
  );
}

function useWalletsOptional(enabled: boolean) {
  if (!enabled) {
    return {
      wallets: [] as Array<{
        address?: string;
        getEthereumProvider?: () => Promise<EthereumProvider>;
      }>,
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useWallets();
}
