"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { createUserSchema, resetPasswordSchema, updateUserSchema } from "./schemas";

export type UserActionState = { error?: string; success?: string };

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function currentManager() {
  const profile = await getCurrentProfile();

  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
    return null;
  }

  return profile;
}

export async function createUserAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const parsed = createUserSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const actor = await currentManager();
  if (!actor || actor.role !== "super_admin") {
    return { error: "No tenés permiso para crear usuarios." };
  }

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return { error: "No se pudo crear la cuenta. Verificá que el email no esté en uso." };
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.rpc("create_managed_profile", {
    target_id: authData.user.id,
    target_display_name: parsed.data.displayName,
    target_role: parsed.data.role,
  });

  if (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(authData.user.id);
    if (cleanupError) {
      return { error: `La cuenta quedó pendiente de reparación: ${authData.user.id}` };
    }
    return { error: "No se pudo crear el perfil. La cuenta fue limpiada." };
  }

  revalidatePath("/users");
  return { success: "Usuario creado. Comunicá la contraseña temporal por un canal seguro." };
}

export async function updateUserAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const parsed = updateUserSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  if (!await currentManager()) return { error: "No tenés permiso para administrar usuarios." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_profile", {
    target_id: parsed.data.userId,
    target_role: parsed.data.role,
    target_is_active: parsed.data.isActive,
  });

  if (error) return { error: error.message };

  revalidatePath("/users");
  return { success: "Usuario actualizado." };
}

export async function resetPasswordAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const parsed = resetPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const actor = await currentManager();
  if (!actor || actor.role !== "super_admin") {
    return { error: "No tenés permiso para restablecer contraseñas." };
  }

  const supabase = await createClient();
  const { error: preparationError } = await supabase.rpc("prepare_password_reset", {
    target_id: parsed.data.userId,
  });
  if (preparationError) return { error: preparationError.message };

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });

  await supabase.rpc("record_password_reset_result", {
    target_id: parsed.data.userId,
    succeeded: !authError,
  });

  if (authError) {
    return { error: "No se pudo actualizar la contraseña. El usuario permanece bloqueado hasta cambiarla." };
  }

  revalidatePath("/users");
  return { success: "Contraseña restablecida. Comunicá la temporal por un canal seguro." };
}
