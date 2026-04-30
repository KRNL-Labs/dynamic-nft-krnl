"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/lib/auth";
import { usePortalContext } from "@/lib/portal";

const links = [
  { href: "/", label: "Home" },
  { href: "/brands", label: "Brands" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, login, walletAddress, ready } = useAuthContext();
  const portal = usePortalContext();

  const active = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const identity = userId || walletAddress;
  const shortIdentity =
    identity && identity.length > 10
      ? `${identity.slice(0, 6)}...${identity.slice(-4)}`
      : identity;

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold text-slate-900">
          Dynamic NFT KRNL
        </Link>
        <nav className="flex items-center gap-3 text-sm font-medium">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-3 py-2 ${
                active(link.href)
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {ready ? (
            isAuthenticated ? (
              <>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  {shortIdentity || "Signed in"}
                </span>
                <button
                  onClick={async () => {
                  await portal.logout();
                  router.push("/");
                }}
                  className="rounded-full bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={login}
                className="rounded-full bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
              >
                Login
              </button>
            )
          ) : (
            <span className="text-slate-500">Loading auth...</span>
          )}
        </div>
      </div>
    </header>
  );
}
