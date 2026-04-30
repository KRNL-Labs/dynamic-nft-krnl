import { client } from "./client";

export async function resolveBrandDestination(): Promise<"/dashboard/brands" | "/onboarding"> {
  try {
    const brands = await client.listMyBrands();
    if (Array.isArray(brands) && brands.length > 0) {
      return "/dashboard/brands";
    }
  } catch (err) {
    console.error("Failed to fetch brands for redirect", err);
  }
  return "/onboarding";
}
