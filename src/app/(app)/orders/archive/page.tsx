import { permanentRedirect, redirect } from "next/navigation";

import { canManageOrderLifecycle } from "@/lib/auth/permissions";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function OrderArchivePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireActiveProfile();
  if (!canManageOrderLifecycle(profile.role)) redirect("/orders");

  const { page: rawPage } = await searchParams;
  const params = new URLSearchParams();
  params.set("tab", "cancelled");
  if (rawPage !== undefined) params.set("cancelledPage", rawPage);

  permanentRedirect(`/orders/archives?${params.toString()}`);
}
