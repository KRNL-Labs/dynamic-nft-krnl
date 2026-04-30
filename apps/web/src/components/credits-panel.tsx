"use client";

import { FormEvent, useState } from "react";

type TopUpResult = {
  paymentId?: string;
  x402Payload?: string;
  [key: string]: unknown;
};

type Props = {
  credits?: number;
  loadingCredits?: boolean;
  onTopUp: (amount: number) => Promise<TopUpResult | void>;
};

export default function CreditsPanel({
  credits,
  loadingCredits,
  onTopUp,
}: Props) {
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TopUpResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await onTopUp(amount);
      if (response) {
        setResult(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-semibold text-slate-900">Credits</h4>
          <p className="text-sm text-slate-600">Top up usage credits.</p>
        </div>
        <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900">
          {loadingCredits ? "Loading..." : `${credits ?? 0} credits`}
        </div>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <div className="sm:w-48">
          <label className="text-sm font-semibold text-slate-900">
            Amount
          </label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? "Starting payment..." : "Top Up"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <p className="font-semibold">Payment started</p>
          <pre className="mt-2 overflow-x-auto text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
