"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { mutationResult, type MutationState } from "@/lib/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { createUserSchema, resetPasswordSchema, updateUserSchema } from "./schemas";

export type UserActionState = MutationState;

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
  previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const failure = (message: string, fieldErrors?: UserActionState["fieldErrors"]) => ({
    ...mutationResult("error", message, fieldErrors),
    resetKey: previous.resetKey,
  });
  const parsed = createUserSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Revisá los datos ingresados.";
    return failure(message, parsed.error.flatten().fieldErrors);
  }

  const actor = await currentManager();
  if (!actor || actor.role !== "super_admin") {
    return failure("No tenés permiso para crear usuarios.");
  }

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return failure("No se pudo crear la cuenta. Verificá que el email no esté en uso.");
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
      return failure(`La cuenta quedó pendiente de reparación: ${authData.user.id}`);
    }
    return failure("No se pudo crear el perfil. La cuenta fue limpiada.");
  }

  revalidatePath("/users");
  return {
    ...mutationResult("success", "Usuario creado. Comunicá la contraseña temporal por un canal seguro."),
    resetKey: crypto.randomUUID(),
  };
}

export async function updateUserAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const parsed = updateUserSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Revisá el cambio solicitado.";
    return mutationResult("error", message, parsed.error.flatten().fieldErrors);
  }

  if (!await currentManager()) return mutationResult("error", "No tenés permiso para administrar usuarios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_profile", {
    target_id: parsed.data.userId,
    target_role: parsed.data.role,
    target_is_active: parsed.data.isActive,
  });

  if (error) {
    const knownMessage = [
      "Debe existir al menos un Super admin activo.",
      "El usuario seleccionado no existe.",
      "No tenés permiso para realizar este cambio.",
      "No tenés permiso para administrar usuarios.",
    ].find((message) => error.message.includes(message));
    return mutationResult("error", knownMessage ?? "No se pudo actualizar el usuario. Intentá nuevamente.");
  }

  revalidatePath("/users");
  if (parsed.data.intent === "role") return mutationResult("success", "Rol actualizado correctamente.");
  return mutationResult("success", parsed.data.isActive ? "Usuario activado correctamente." : "Usuario desactivado correctamente.");
}

export async function resetPasswordAction(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const parsed = resetPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Revisá la contraseña temporal.";
    return mutationResult("error", message, parsed.error.flatten().fieldErrors);
  }

  const actor = await currentManager();
  if (!actor || actor.role !== "super_admin") {
    return mutationResult("error", "No tenés permiso para restablecer contraseñas.");
  }

  const supabase = await createClient();
  const { error: preparationError } = await supabase.rpc("prepare_password_reset", {
    target_id: parsed.data.userId,
  });
  if (preparationError) {
    const message = preparationError.message.includes("El usuario seleccionado no existe.")
      ? "El usuario seleccionado no existe."
      : preparationError.message.includes("No tenés permiso")
        ? "No tenés permiso para restablecer contraseñas."
        : "No se pudo preparar el restablecimiento. Intentá nuevamente.";
    return mutationResult("error", message);
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });

  await supabase.rpc("record_password_reset_result", {
    target_id: parsed.data.userId,
    succeeded: !authError,
  });

  if (authError) {
    return mutationResult("error", "No se pudo actualizar la contraseña. El usuario permanece bloqueado hasta cambiarla.");
  }

  revalidatePath("/users");
  return mutationResult("success", "Contraseña restablecida. Comunicá la temporal por un canal seguro.");
}
