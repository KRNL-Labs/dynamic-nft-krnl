import Link from "next/link";
import { Brand } from "@/types";

type Props = {
  brand: Brand & { brandId?: string };
};

export default function BrandCard({ brand }: Props) {
  const brandId = brand.brandId || brand.id;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-lg font-semibold text-slate-700">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="h-14 w-14 rounded-xl object-cover"
            />
          ) : (
            brand.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">
            {brand.name}
          </h3>
          {brand.description && (
            <p className="mt-1 text-sm text-slate-600">{brand.description}</p>
          )}
          {brand.stats && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              {typeof brand.stats.members === "number" && (
                <span>{brand.stats.members} members</span>
              )}
              {typeof brand.stats.questsCompleted === "number" && (
                <span>{brand.stats.questsCompleted} quests completed</span>
              )}
              {typeof brand.stats.tokensMinted === "number" && (
                <span>{brand.stats.tokensMinted} NFTs</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-slate-400">
          Brand ID: {brandId}
        </span>
        {brandId && (
          <Link
            href={`/brands/${brandId}`}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            View
          </Link>
        )}
      </div>
    </div>
  );
}
