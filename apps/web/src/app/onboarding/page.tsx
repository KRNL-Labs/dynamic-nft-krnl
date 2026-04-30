"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { client } from "@/lib/client";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import { useToast } from "@/components/toast";
import logoImg from "@/../public/images/logo.jpg";
import { resolveBrandDestination } from "@/lib/brandRedirect";

type BrandPayload = {
  name: string;
  description: string;
  primaryChainId: string;
  rpcUrl: string;
  contractAddress: string;
};

export default function OnboardingPage() {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = useState<BrandPayload>({
    name: "",
    description: "",
    primaryChainId: "",
    rpcUrl: "",
    contractAddress: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const guard = async () => {
      if (!auth.ready) return;
      if (!auth.isAuthenticated) {
        router.replace("/login");
        return;
      }
      if (!auth.walletAddress) return;
      try {
        await portal.ensurePortal("brand");
      } catch (err) {
        console.error("Failed to ensure brand portal", err);
        return;
      }
      const destination = await resolveBrandDestination();
      if (destination === "/dashboard/brands") {
        router.replace("/dashboard/brands");
        return;
      }
      setChecking(false);
    };
    void guard();
  }, [auth.isAuthenticated, auth.ready, auth.walletAddress, portal, router]);

  const handleChange = (field: keyof BrandPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step === 1) {
      if (!form.name.trim()) {
        setError("Name is required");
        return;
      }
      setError(null);
      setStep(2);
      return;
    }

    if (!form.primaryChainId.trim() || !form.rpcUrl.trim() || !form.contractAddress.trim()) {
      setError("All fields in Step 2 are required");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const chainId = Number(form.primaryChainId);
      const response = await (logoFile
        ? (() => {
            const formData = new FormData();
            formData.append("name", form.name.trim());
            formData.append("description", form.description ?? "");
            formData.append("primaryChainId", String(chainId));
            formData.append("logo", logoFile);
            return client.createBrand(formData);
          })()
        : client.createBrand({
            name: form.name.trim(),
            description: form.description ?? "",
            primaryChainId: chainId,
          }));
      const newId =
        response.brandId ||
        response.id ||
        (response as { brand?: { id?: string } })?.brand?.id ||
        (response as { data?: { id?: string } })?.data?.id;
      if (newId) {
        await client.setNftConfig(newId, {
          contractAddress: form.contractAddress,
          chainId: Number(form.primaryChainId),
          rpcUrl: form.rpcUrl,
        });
        await portal.ensurePortal("brand", newId);
        toast.addToast("Brand created", "success");
        router.push(`/dashboard/brand/${newId}`);
      } else {
        setError("Brand created but no id was returned.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create brand";
      setError(msg);
      toast.addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={auth.isAuthenticated ? "/onboarding" : "/login"}>
              <Image
                src={logoImg}
                alt="KRNL logo"
                width={40}
                height={40}
                className="rounded-lg object-cover border border-red-500/40"
                priority
              />
            </Link>
            <span className="text-lg font-semibold text-white">Brand onboarding</span>
          </div>
          <button
            onClick={async () => {
              await portal.logout();
              router.push("/");
            }}
            className="btn-secondary"
          >
            Logout
          </button>
        </div>

        <div className="card border-zinc-800 p-8">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-red-300">
                Step {step} of 2
              </span>
              <span>{step === 1 ? "Brand Details" : "Chain & NFT"}</span>
            </div>
            <h1 className="text-3xl font-bold text-white">Create your brand</h1>
            <p className="text-sm text-zinc-400">
              Set up brand metadata before configuring your NFTs.
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {step === 1 && (
              <>
                <div>
                  <label className="text-sm font-semibold text-zinc-300">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    required
                    className="input-dark mt-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-zinc-300">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    rows={3}
                    className="input-dark mt-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-zinc-300">
                    Logo
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="btn-secondary cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                        className="sr-only"
                      />
                      Choose File
                    </label>
                    <span className="text-xs text-zinc-500">
                      {logoFile ? logoFile.name : "No file selected"}
                    </span>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="text-sm font-semibold text-zinc-300">
                    Primary Chain ID
                  </label>
                  <input
                    value={form.primaryChainId}
                    onChange={(e) => handleChange("primaryChainId", e.target.value)}
                    placeholder="e.g. 8453"
                    required
                    className="input-dark mt-2"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-zinc-300">
                    Chain RPC URL
                  </label>
                  <input
                    value={form.rpcUrl}
                    onChange={(e) => handleChange("rpcUrl", e.target.value)}
                    placeholder="https://..."
                    required
                    className="input-dark mt-2"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Infura/Alchemy URL, not KRNL node
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-zinc-300">
                    Contract Address
                  </label>
                  <input
                    value={form.contractAddress}
                    onChange={(e) => handleChange("contractAddress", e.target.value)}
                    placeholder="0x..."
                    required
                    className="input-dark mt-2"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="rounded-xl border border-red-600/40 bg-red-600/10 px-4 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              {step === 2 ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary px-6"
              >
                {loading ? "Creating..." : step === 1 ? "Continue" : "Create Brand"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
