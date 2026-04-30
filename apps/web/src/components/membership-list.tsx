type Props = {
  tokens: Array<string | number>;
};

export default function MembershipList({ tokens }: Props) {
  if (!tokens.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        No NFTs yet. Complete quests to earn rewards.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900">Your Tokens</h4>
      <div className="mt-3 flex flex-wrap gap-2">
        {tokens.map((token) => (
          <span
            key={token.toString()}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
          >
            #{token}
          </span>
        ))}
      </div>
    </div>
  );
}
