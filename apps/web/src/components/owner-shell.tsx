"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";
import logoImg from "@/../public/images/logo.jpg";
import { getOwnerSelectedBrandId } from "@/lib/owner-brand";

type NavItem = {
  href: string;
  label: string;
};

const ownerBrandNav = (brandId: string): NavItem[] => [
  {
    href: `/owner/brand/${encodeURIComponent(brandId)}/dashboard`,
    label: "Overview",
  },
  {
    href: `/owner/brand/${encodeURIComponent(brandId)}/lootbox`,
    label: "Lootbox",
  },
  {
    href: `/owner/brand/${encodeURIComponent(brandId)}/traits`,
    label: "Traits",
  },
];

export default function OwnerShell({
  children,
  headerTitle = "Your Rewards",
  lootKeysBalance,
}: {
  children: React.ReactNode;
  headerTitle?: string;
  lootKeysBalance?: number | string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, login } = useAuthContext();
  const portal = usePortalContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const ownerBrandId = getOwnerSelectedBrandId();
  const routeBrandMatch = pathname.match(/^\/owner\/brand\/([^/]+)/);
  const routeBrandId = routeBrandMatch?.[1] ?? null;
  const scopedBrandId = routeBrandId || ownerBrandId;
  const inScopedOwnerRoute = pathname.startsWith("/owner/brand/");
  const navItems =
    scopedBrandId && inScopedOwnerRoute ? ownerBrandNav(scopedBrandId) : [];

  const handleLogin = async () => {
    await login();
    try {
      await portal.ensurePortal("owner");
    } catch {
      // ignore portal ensure errors here
    }
    router.push("/owner/brands");
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
          <Link href="/owner/brands" className="flex items-center gap-2">
            <Image
              src={logoImg}
              alt="KRNL logo"
              width={44}
              height={44}
              className="rounded-lg object-cover border border-red-500/40"
              priority
            />
            <span className="text-lg font-bold text-white">Owners</span>
          </Link>
          <button
            className="md:hidden text-zinc-400"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <nav className="space-y-2">
          {!inScopedOwnerRoute && (
            <Link
              href="/owner/brands"
              className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${
                pathname === "/owner/brands" || pathname === "/owner"
                  ? "bg-red-600/20 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              Brands
            </Link>
          )}
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={`${item.href}-${item.label}`}
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
                Owner Portal
              </p>
              <p className="text-lg font-semibold text-white">{headerTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lootKeysBalance !== undefined && lootKeysBalance !== null && (
              <span className="rounded-full border border-red-500/40 bg-red-600/10 px-3 py-1 text-xs font-semibold text-red-200">
                Lootkeys: {lootKeysBalance}
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
