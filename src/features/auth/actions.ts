"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { changePasswordSchema } from "@/lib/auth/password";
import { mutationResult, type MutationState } from "@/lib/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido."),
  password: z.string().min(1, "Ingresá tu contraseña."),
});

function readFormData(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function loginAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = loginSchema.safeParse(readFormData(formData));

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Revisá los datos ingresados.";
    return mutationResult("error", message, parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return mutationResult("error", "Email o contraseña incorrectos.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signOut();
    return mutationResult("error", "No se pudo validar tu sesión. Intentá nuevamente.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return mutationResult("error", "Tu cuenta no tiene acceso a Digraf.");
  }

  redirect(profile.must_change_password ? "/change-password?notice=signed-in" : "/dashboard?notice=signed-in");
}

export async function changePasswordAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = changePasswordSchema.safeParse(readFormData(formData));

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Revisá los datos ingresados.";
    return mutationResult("error", message, parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  if (!profile.must_change_password) {
    redirect("/dashboard");
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return mutationResult("error", "No se pudo actualizar la contraseña. Intentá nuevamente.");
  }

  const admin = createAdminClient();
  const { error: completionError } = await admin
    .from("profiles")
    .update({
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .eq("is_active", true)
    .eq("must_change_password", true)
    .select("id")
    .single();

  if (completionError) {
    return mutationResult(
      "error",
      "La contraseña se actualizó, pero falta habilitar tu acceso. Reintentá para completar el proceso.",
    );
  }

  redirect("/dashboard?notice=password-updated");
}

export async function logoutAction(_previousState: MutationState): Promise<MutationState> {
  void _previousState;
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return mutationResult("error", "No se pudo cerrar la sesión. Intentá nuevamente.");
  redirect("/login?notice=signed-out");
}
