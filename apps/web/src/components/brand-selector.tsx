"use client";

import { Brand } from "@/types";

type Props = {
  brands: Brand[];
  activeBrandId?: string;
  onSelect: (brandId: string) => void;
};

export default function BrandSelector({ brands, activeBrandId, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-zinc-500">
        Brands
      </p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
        {brands.length === 0 && (
          <p className="text-sm text-zinc-500">
            No brands yet. Create one.
          </p>
        )}
        <div className="space-y-2">
          {brands.map((brand) => {
            const active = brand.id === activeBrandId;
            return (
              <button
                key={brand.id}
                onClick={() => onSelect(brand.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-red-600/20 text-white"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <span>{brand.name}</span>
                {brand.zealyConnected && (
                  <span className="text-[10px] uppercase text-red-300">
                    Zealy
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
