import { useMemo, useState } from "react";
import { LootboxResult } from "@/types";

type Props = {
  tokens: Array<string | number>;
  onOpen: (tokenId: string) => Promise<void>;
  loading?: boolean;
  result?: LootboxResult | null;
  error?: string | null;
};

export default function LootboxPanel({
  tokens,
  onOpen,
  loading,
  result,
  error,
}: Props) {
  const [tokenId, setTokenId] = useState<string>("");
  const selectedToken = useMemo(
    () => tokenId || (tokens[0] ? tokens[0].toString() : ""),
    [tokenId, tokens],
  );

  if (!tokens.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        You need at least one NFT to open a lootbox.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <label className="text-sm font-semibold text-slate-900">
            Select Token
          </label>
          <select
            value={selectedToken}
            onChange={(e) => setTokenId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {tokens.map((token) => (
              <option key={token.toString()} value={token.toString()}>
                #{token}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => onOpen(selectedToken)}
          disabled={!selectedToken || loading}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? "Opening..." : "Open Lootbox"}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <p className="font-semibold">Updated Traits</p>
          <pre className="mt-2 overflow-x-auto text-xs">
            {JSON.stringify(result.updatedTraits ?? result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
