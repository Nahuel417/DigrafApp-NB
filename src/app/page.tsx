import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/current-profile";

export default async function HomePage() {
  const profile = await getCurrentProfile();

  redirect(
    profile ? (profile.mustChangePassword ? "/change-password" : "/dashboard") : "/login",
  );
}
