"use client";

import { useEffect, useState } from "react";
import { RewardRule } from "@/types";
import { useToast } from "./toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (rule: RewardRule) => Promise<void>;
  initial?: RewardRule | null;
};

export default function RewardRuleEditor({
  open,
  onClose,
  onSave,
  initial,
}: Props) {
  const toast = useToast();
  const [lootKeysDelta, setLootKeysDelta] = useState<number>(0);
  const [enabled, setEnabled] = useState(true);
  const [label, setLabel] = useState<string>("");
  const [xpMode, setXpMode] = useState<"ZEALY" | "OVERRIDE" | "NONE">(
    "ZEALY",
  );
  const [xpOverride, setXpOverride] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setLootKeysDelta(initial.lootKeysDelta ?? 0);
      setEnabled(initial.enabled ?? true);
      setLabel(initial.label ?? initial.note ?? "");
      setXpMode(initial.xpMode ?? "ZEALY");
      setXpOverride(
        initial.xpOverride !== undefined &&
          initial.xpOverride !== null
          ? String(initial.xpOverride)
          : "",
      );
    } else {
      setLootKeysDelta(0);
      setEnabled(true);
      setLabel("");
      setXpMode("ZEALY");
      setXpOverride("");
    }
    setValidationError(null);
  }, [initial, open]);

  useEffect(() => {
    if (lootKeysDelta < 0) {
      setValidationError("lootKeysDelta must be >= 0");
      return;
    }
    if (xpMode === "OVERRIDE") {
      if (xpOverride.trim() === "") {
        setValidationError("XP override is required when mode is OVERRIDE");
        return;
      }
      const parsed = Number(xpOverride);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setValidationError("XP override must be a number >= 0");
        return;
      }
    }
    setValidationError(null);
  }, [lootKeysDelta, xpMode, xpOverride]);

  const handleSave = async () => {
    if (validationError) {
      toast.addToast(validationError, "error");
      return;
    }

    const xpOverrideValue =
      xpMode === "OVERRIDE" ? Number(xpOverride) : null;

    setLoading(true);
    try {
      await onSave({
        lootKeysDelta,
        enabled,
        label: label.trim() ? label.trim() : "",
        xpMode,
        xpOverride: xpOverrideValue,
      });
      toast.addToast("Reward rule saved", "success");
      onClose();
    } catch (err) {
      toast.addToast(
        err instanceof Error ? err.message : "Failed to save reward rule",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Reward Rule</h3>
          <button className="text-zinc-400 hover:text-zinc-200" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-300">XP Credit Mode</label>
            <select
              value={xpMode}
              onChange={(e) =>
                setXpMode(e.target.value as "ZEALY" | "OVERRIDE" | "NONE")
              }
              className="input-dark mt-2"
            >
              <option value="ZEALY">Use Zealy XP</option>
              <option value="OVERRIDE">Override XP</option>
              <option value="NONE">No XP</option>
            </select>
          </div>
          {xpMode === "OVERRIDE" && (
            <div className="sm:col-span-2">
              <label className="text-sm text-zinc-300">XP Override</label>
              <input
                type="number"
                min={0}
                value={xpOverride}
                onChange={(e) => setXpOverride(e.target.value)}
                className="input-dark mt-2"
              />
            </div>
          )}
          <div>
            <label className="text-sm text-zinc-300">Loot Keys Awarded</label>
            <p className="mt-1 text-xs text-zinc-500">
              Loot keys are earned by end users and can be used to open lootboxes.
            </p>
            <input
              type="number"
              min={0}
              value={lootKeysDelta}
              onChange={(e) => setLootKeysDelta(Number(e.target.value))}
              className="input-dark mt-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-zinc-300">Internal label</label>
            <p className="mt-1 text-xs text-zinc-500">
              Optional, not visible to users.
            </p>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Internal label"
              className="input-dark mt-2"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="reward-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-red-500"
            />
            <label htmlFor="reward-enabled" className="text-sm text-zinc-300">
              Reward enabled
            </label>
          </div>
          {validationError && (
            <div className="sm:col-span-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {validationError}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={loading || Boolean(validationError)}
          >
            {loading ? "Saving..." : "Save rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
