"use client";

import PortalGate from "@/components/portal-gate";
import OwnerShell from "@/components/owner-shell";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalGate portal="owner">
      <OwnerShell>
        {children}
      </OwnerShell>
    </PortalGate>
  );
}
