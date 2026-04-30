"use client";

import { useParams } from "next/navigation";
import PortalGate from "@/components/portal-gate";

export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ brandId: string }>();
  const brandId = typeof params?.brandId === "string" ? params.brandId : null;
  return (
    <PortalGate portal="brand" brandId={brandId}>
      {children}
    </PortalGate>
  );
}
