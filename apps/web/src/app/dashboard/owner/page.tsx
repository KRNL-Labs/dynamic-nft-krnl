import { redirect } from "next/navigation";

export default function OwnerDashboardRedirectPage() {
  redirect("/owner/brands");
}
