import { redirect } from "next/navigation";

import { PricingManager } from "@/features/pricing/components/pricing-manager";
import { getPriceList } from "@/features/pricing/queries";
import { canManagePrices } from "@/lib/auth/permissions";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function CommercialPage() {
  const profile = await requireActiveProfile();
  if (!canManagePrices(profile.role)) redirect("/dashboard");
  const data = await getPriceList();
  if (!data) redirect("/dashboard");
  return <main className="w-full"><PricingManager data={data} /></main>;
}
