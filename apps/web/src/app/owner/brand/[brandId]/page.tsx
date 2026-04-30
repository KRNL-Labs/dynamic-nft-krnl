import { redirect } from "next/navigation";

export default async function OwnerBrandAliasPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  redirect(`/owner/brand/${brandId}/dashboard`);
}
