"use client";

import { FormEvent, useEffect, useState } from "react";
import { NftConfig } from "@/types";
import { useToast } from "./toast";

type Props = {
  initial?: NftConfig | null;
  onSave: (payload: NftConfig) => Promise<void>;
};

export default function NftConfigForm({ initial, onSave }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<{
    contractAddress: string;
    chainId: string;
    rpcUrl: string;
  }>({
    contractAddress: initial?.contractAddress ?? "",
    chainId: initial?.chainId ? String(initial.chainId) : "",
    rpcUrl: initial?.rpcUrl ?? "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm({
      contractAddress: initial?.contractAddress ?? "",
      chainId: initial?.chainId ? String(initial.chainId) : "",
      rpcUrl: initial?.rpcUrl ?? "",
    });
  }, [initial?.contractAddress, initial?.chainId, initial?.rpcUrl]);

  const handleChange = (
    field: "contractAddress" | "chainId" | "rpcUrl",
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: NftConfig = {};
      if (form.contractAddress.trim()) {
        payload.contractAddress = form.contractAddress.trim();
      }
      if (form.chainId.trim()) {
        payload.chainId = Number(form.chainId);
      }
      if (form.rpcUrl.trim()) {
        payload.rpcUrl = form.rpcUrl.trim();
      }
      await onSave(payload);
      toast.addToast("NFT config saved", "success");
    } catch (err) {
      toast.addToast(
        err instanceof Error ? err.message : "Failed to save NFT config",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card space-y-4 p-4" onSubmit={handleSubmit}>
      <div>
        <label className="text-sm text-zinc-300">
          Contract Address (QuestProgressNFT)
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          Deployed QuestProgressNFT contract address.
        </p>
        <input
          required
          value={form.contractAddress || ""}
          onChange={(e) => handleChange("contractAddress", e.target.value)}
          className="input-dark mt-2"
        />
      </div>
      <div>
        <label className="text-sm text-zinc-300">Chain ID</label>
        <p className="mt-1 text-xs text-zinc-500">Sepolia = 11155111.</p>
        <input
          required
          value={form.chainId}
          onChange={(e) => handleChange("chainId", e.target.value)}
          className="input-dark mt-2"
        />
      </div>
      <div>
        <label className="text-sm text-zinc-300">Chain RPC URL</label>
        <p className="mt-1 text-xs text-zinc-500">
          RPC URL.
        </p>
        <input
          required
          value={form.rpcUrl || ""}
          onChange={(e) => handleChange("rpcUrl", e.target.value)}
          className="input-dark mt-2"
        />
      </div>
      <div className="flex items-center justify-end gap-3">
        <button className="btn-primary" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
