"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "@/types";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import BrandSelector from "./brand-selector";
import logoImg from "@/../public/images/logo.jpg";
import { getPortalWalletAddress } from "@/lib/portal-wallet";

type NavItem = {
  href: string;
  label: string;
};

const brandNav = (brandId: string): NavItem[] => [
  { href: `/dashboard/brand/${brandId}/overview`, label: "Overview" },
  { href: `/dashboard/brand/${brandId}/nft`, label: "NFT Config" },
  { href: `/dashboard/brand/${brandId}/zealy`, label: "Zealy" },
  { href: `/dashboard/brand/${brandId}/assets`, label: "Assets" },
  { href: `/dashboard/brand/${brandId}/lootbox`, label: "Lootbox" },
  { href: `/dashboard/brand/${brandId}/billing`, label: "Billing" },
  { href: `/dashboard/brand/${brandId}/workflows`, label: "KRNL Runs" },
];

type Props = {
  children: React.ReactNode;
  brands?: Brand[];
  brandId?: string;
  brandName?: string;
  credits?: number;
};

export default function DashboardShell({
  children,
  brands = [],
  brandId,
  brandName,
  credits,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, walletAddress, wallets, login } = useAuthContext();
  const portal = usePortalContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const brandWallet = getPortalWalletAddress("brand", wallets, walletAddress);

  const navItems = brandId ? brandNav(brandId) : [];
  const homeHref = isAuthenticated ? "/dashboard/brands" : "/login";

  const handleBrandSelect = async (id: string) => {
    if (!brandWallet) {
      router.push("/select-portal");
      return;
    }
    try {
      await portal.ensurePortal("brand", id);
    } catch {
      // ignore selection errors; routing still allowed
    }
    router.push(`/dashboard/brand/${id}/overview`);
    setSidebarOpen(false);
  };

  const handleLogin = async () => {
    await login();
    try {
      await portal.ensurePortal("brand");
    } catch {
      // ignore portal ensure errors here
    }
    router.push("/dashboard/brands");
  };

  const handleLogout = async () => {
    await portal.logout();
    router.push("/");
  };

  return (
    <div className="flex min-h-screen bg-black text-zinc-100">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform bg-zinc-950/90 border-r border-zinc-900 p-4 transition md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <Link href={homeHref} className="flex items-center gap-2">
            <Image
              src={logoImg}
              alt="KRNL logo"
              width={44}
              height={44}
              className="rounded-lg object-cover border border-red-500/40"
              priority
            />
            <span className="text-lg font-bold text-white">Brands</span>
          </Link>
          <button
            className="md:hidden text-zinc-400"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <BrandSelector brands={brands} activeBrandId={brandId} onSelect={handleBrandSelect} />
          <nav className="space-y-2">
            {navItems.length === 0 && (
              <div className="text-sm text-zinc-500">
                Select a brand to see navigation.
              </div>
            )}
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-red-600/20 text-white"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="flex flex-1 min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-900 bg-zinc-950/80 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              className="text-zinc-400 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Brand
              </p>
              <p className="text-lg font-semibold text-white">
                {brandName || "Select a brand"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {typeof credits === "number" && (
              <span className="rounded-full border border-red-500/40 bg-red-600/10 px-3 py-1 text-xs font-semibold text-red-200">
                Credits: {credits}
              </span>
            )}
            {isAuthenticated ? (
              <button className="btn-secondary" onClick={handleLogout}>
                Logout
              </button>
            ) : (
              <button className="btn-primary" onClick={handleLogin}>
                Login
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
