"use client";

import PortalGate from "@/components/portal-gate";

export default function BrandCollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalGate portal="brand">
      {children}
    </PortalGate>
  );
}
