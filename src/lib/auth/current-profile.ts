import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  displayName: string;
  role: "super_admin" | "admin" | "attention" | "employee";
  mustChangePassword: boolean;
};

export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return null;
  }

  return {
    id: profile.id,
    displayName: profile.display_name,
    role: profile.role,
    mustChangePassword: profile.must_change_password,
  };
});
