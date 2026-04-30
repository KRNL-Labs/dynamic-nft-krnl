import { redirect } from "next/navigation";

export default async function BrandIndexRedirect({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  redirect(`/dashboard/brand/${brandId}/overview`);
}
