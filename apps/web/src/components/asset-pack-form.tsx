"use client";

import { FormEvent, useState } from "react";
import { useToast } from "./toast";

type Props = {
  onCreate: (payload: {
    name: string;
    description?: string;
    baseImageUrl?: string;
    previewImageUrl?: string;
  }) => Promise<void>;
};

export default function AssetPackForm({ onCreate }: Props) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    baseImageUrl: "",
    previewImageUrl: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onCreate(form);
      setForm({
        name: "",
        description: "",
        baseImageUrl: "",
        previewImageUrl: "",
      });
      toast.addToast("Asset pack created", "success");
    } catch (err) {
      toast.addToast(
        err instanceof Error ? err.message : "Failed to create asset pack",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card space-y-3 p-4" onSubmit={handleSubmit}>
      <h4 className="text-base font-semibold text-white">Create Asset Pack</h4>
      <div>
        <label className="text-sm text-zinc-300">Name</label>
        <input
          required
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          className="input-dark mt-2"
        />
      </div>
      <div>
        <label className="text-sm text-zinc-300">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={2}
          className="input-dark mt-2"
        />
      </div>
      <div>
        <label className="text-sm text-zinc-300">Base Image URL</label>
        <input
          value={form.baseImageUrl}
          onChange={(e) => handleChange("baseImageUrl", e.target.value)}
          className="input-dark mt-2"
        />
      </div>
      <div>
        <label className="text-sm text-zinc-300">Preview Image URL</label>
        <input
          value={form.previewImageUrl}
          onChange={(e) => handleChange("previewImageUrl", e.target.value)}
          className="input-dark mt-2"
        />
      </div>
      <div className="flex justify-end">
        <button className="btn-primary" disabled={loading}>
          {loading ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}
