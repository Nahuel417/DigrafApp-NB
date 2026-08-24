import { permanentRedirect, redirect } from "next/navigation";

import { canArchiveDeliveredOrder } from "@/lib/auth/permissions";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function DeliveredArchivePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireActiveProfile();
  if (!canArchiveDeliveredOrder(profile.role)) redirect("/orders");

  const { page: rawPage } = await searchParams;
  const params = new URLSearchParams();
  params.set("tab", "delivered");
  if (rawPage !== undefined) params.set("deliveredPage", rawPage);

  permanentRedirect(`/orders/archives?${params.toString()}`);
}
