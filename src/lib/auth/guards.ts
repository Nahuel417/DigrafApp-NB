import { redirect } from "next/navigation";

import { getCurrentProfile } from "./current-profile";

export async function requireActiveProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.mustChangePassword) {
    redirect("/change-password");
  }

  return profile;
}

export async function requireMandatoryPasswordChange() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.mustChangePassword) {
    redirect("/dashboard");
  }

  return profile;
}
