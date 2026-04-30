import Link from "next/link";

type Item = {
  label: string;
  complete: boolean;
  href: string;
};

export default function SetupChecklist({ items }: { items: Item[] }) {
  return (
    <details open className="card p-5 space-y-1">
      <summary className="flex cursor-pointer items-center justify-between list-none text-lg font-semibold text-white leading-none">
        <span>Setup Checklist</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-sm text-zinc-300">
          ▼
        </span>
      </summary>
      <div className="space-y-3 mt-7">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                  item.complete
                    ? "border-green-500/60 bg-green-500/20 text-green-200"
                    : "border-zinc-600 bg-zinc-800 text-zinc-300"
                }`}
              >
                {item.complete ? "✓" : ""}
              </span>
              <span className="text-sm text-zinc-200">{item.label}</span>
            </div>
            <Link href={item.href} className="text-sm font-semibold text-red-400 hover:text-red-300">
              Go
            </Link>
          </div>
        ))}
      </div>
    </details>
  );
}
