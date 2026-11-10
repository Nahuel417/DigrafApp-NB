import { redirect } from "next/navigation";

import { MetricsDashboard } from "@/features/metrics/components/metrics-dashboard";
import { canViewMetrics } from "@/features/metrics/access";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function MetricsPage() {
  const profile = await requireActiveProfile();
  if (!canViewMetrics(profile.role)) redirect("/dashboard");

  return <MetricsDashboard />;
}
