"use client";

import { FormEvent, useEffect, useState } from "react";

type Props = {
  onSubmit: (payload: {
    communityId: string;
    apiKey: string;
    webhookSecret?: string;
  }) => Promise<void>;
  connected?: boolean;
  initialCommunityId?: string;
  onSync?: () => Promise<void>;
};

export default function ZealyConnectForm({
  onSubmit,
  connected,
  initialCommunityId,
  onSync,
}: Props) {
  const [communityId, setCommunityId] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [replaceKey, setReplaceKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [communityTouched, setCommunityTouched] = useState(false);

  useEffect(() => {
    if (!communityTouched && initialCommunityId) {
      setCommunityId(initialCommunityId);
    }
  }, [initialCommunityId, communityTouched]);

  useEffect(() => {
    if (!connected) {
      setReplaceKey(true);
    } else {
      setReplaceKey(false);
      setApiKey("");
    }
  }, [connected]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    if (!communityId.trim()) {
      setError("Community ID is required");
      setLoading(false);
      return;
    }
    const requiresApiKey = !connected || replaceKey;
    if (connected && !replaceKey) {
      setError("Click Replace key to enter a new API key.");
      setLoading(false);
      return;
    }
    if (requiresApiKey && !apiKey.trim()) {
      setError("API key is required");
      setLoading(false);
      return;
    }
    try {
      await onSubmit({
        communityId,
        apiKey,
        webhookSecret: webhookSecret.trim() || undefined,
      });
      setMessage("Zealy connected");
      setApiKey("");
      setReplaceKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Zealy");
    } finally {
      setLoading(false);
    }
  };

  const keyInputLocked = Boolean(connected) && !replaceKey;

  return (
    <form
      onSubmit={handleSubmit}
      className="card p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-semibold text-white">Zealy</h4>
          <p className="text-sm text-zinc-400">
            Sync quests from your Zealy community.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            connected
              ? "bg-green-600/20 text-green-200"
              : "bg-zinc-800 text-zinc-300"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label className="text-sm font-semibold text-zinc-200">
            Community ID
          </label>
          <input
            value={communityId}
            onChange={(e) => {
              setCommunityTouched(true);
              setCommunityId(e.target.value);
            }}
            placeholder="zealy-community-id"
            required
            className="input-dark mt-2"
          />
        </div>
        <div className="sm:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-semibold text-zinc-200">
              API Key
            </label>
            {connected && keyInputLocked && (
              <button
                type="button"
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                onClick={() => {
                  setReplaceKey(true);
                  setApiKey("");
                  setError(null);
                  setMessage(null);
                }}
              >
                Replace key
              </button>
            )}
          </div>
          <input
            type="password"
            value={keyInputLocked ? "••••••••" : apiKey}
            onChange={(e) => {
              if (keyInputLocked) return;
              setApiKey(e.target.value);
            }}
            placeholder={keyInputLocked ? "••••••••" : "Zealy API key"}
            required
            readOnly={keyInputLocked}
            disabled={keyInputLocked}
            className="input-dark mt-2"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-semibold text-zinc-200">
            Webhook Secret (optional)
          </label>
          <input
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Webhook secret"
            className="input-dark mt-2"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Saving..." : connected ? "Save Zealy" : "Connect Zealy"}
        </button>
        {onSync && (
          <button
            type="button"
            disabled={syncing}
            onClick={async () => {
              if (!onSync) return;
              setSyncing(true);
              setSyncMessage(null);
              setError(null);
              try {
                await onSync();
                setSyncMessage("Sync triggered");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Failed to sync quests",
                );
              } finally {
                setSyncing(false);
              }
            }}
            className="btn-secondary"
          >
            {syncing ? "Syncing..." : "Sync quests"}
          </button>
        )}
        {message && <span className="text-sm text-emerald-700">{message}</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}
        {syncMessage && (
          <span className="text-sm text-green-400">{syncMessage}</span>
        )}
      </div>
    </form>
  );
}
