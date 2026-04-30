"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { useAuthContext } from "@/lib/auth";
import { client } from "@/lib/client";
import { usePortalContext } from "@/lib/portal";
import { useToast } from "@/components/toast";

type BrandPayload = {
  name: string;
  description: string;
  primaryChainId: string;
  rpcUrl: string;
};

export default function CreateBrandPage() {
  const auth = useAuthContext();
  const portal = usePortalContext();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<BrandPayload>({
    name: "",
    description: "",
    primaryChainId: "",
    rpcUrl: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contractAddressFromEnv = process.env.NEXT_PUBLIC_CONTRACT?.trim() ?? "";

  const handleChange = (field: keyof BrandPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!auth.isAuthenticated) {
      await auth.login();
      return;
    }

    if (!form.primaryChainId || !form.rpcUrl.trim()) {
      setError("Primary chain and RPC URL are required.");
      return;
    }

    if (!contractAddressFromEnv) {
      setError("NEXT_PUBLIC_CONTRACT is not configured.");
      return;
    }

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
          contractAddress: contractAddressFromEnv,
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
      setError(
        err instanceof Error ? err.message : "Failed to create brand",
      );
      toast.addToast(
        err instanceof Error ? err.message : "Failed to create brand",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Dashboard
        </p>
        <h1 className="text-2xl font-bold text-white">Create Brand</h1>
        <p className="text-sm text-zinc-400">
          Provide brand info, chain, and NFT contract details.
        </p>
      </div>

      <form className="card space-y-4 p-6" onSubmit={handleSubmit}>
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
          <label className="text-sm font-semibold text-zinc-300">Logo</label>
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
            
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-600/40 bg-red-600/10 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Creating..." : "Create Brand"}
        </button>
      </form>
    </div>
  );

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Create a brand</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Login to continue with onboarding.
          </p>
          <button
            onClick={auth.login}
            className="btn-primary mt-4"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return <DashboardShell>{content}</DashboardShell>;
}
