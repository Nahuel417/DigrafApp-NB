import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .regex(/\d/, "La contraseña debe incluir al menos un número.");

const emailSchema = z.string().trim().email("Ingresá un email válido.");
const displayNameSchema = z.string().trim().min(2).max(100);
const role = "super_admin";

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasArgument(name) {
  return process.argv.includes(name);
}

function requireEnvironment(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }

  return value;
}

function parseOrThrow(schema, value) {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dato inválido.");
  }

  return parsed.data;
}

function ensureAllowedEnvironment(url) {
  const hostname = new URL(url).hostname;
  const isLocal = hostname === "127.0.0.1" || hostname === "localhost";

  if (!isLocal && !hasArgument("--confirm-remote")) {
    throw new Error(
      "El bootstrap remoto requiere --confirm-remote y autorización explícita para ese entorno.",
    );
  }
}

function getMode() {
  if (hasArgument("--repair-profile")) {
    return "repair";
  }

  if (hasArgument("--delete-auth")) {
    return "delete";
  }

  return "create";
}

export async function createSuperAdmin(admin) {
  const email = parseOrThrow(emailSchema, process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL);
  const displayName = parseOrThrow(
    displayNameSchema,
    process.env.BOOTSTRAP_SUPER_ADMIN_NAME,
  );
  const password = parseOrThrow(passwordSchema, process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD);

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", role);

  if (countError) {
    throw new Error(`No se pudo comprobar los perfiles existentes: ${countError.message}`);
  }

  if ((count ?? 0) > 0) {
    throw new Error("El bootstrap solo se permite cuando todavía no existe ningún perfil.");
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(`No se pudo crear el usuario de Auth: ${authError?.message ?? "error desconocido"}`);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    display_name: displayName,
    role,
    is_active: true,
    must_change_password: true,
  });

  if (profileError) {
    console.error(`Auth creado para user_id=${authData.user.id}, pero el perfil falló.`);
    console.error(
      `Para repararlo: pnpm bootstrap:super-admin --repair-profile ${authData.user.id}`,
    );
    console.error(
      `Para eliminar Auth con confirmación: pnpm bootstrap:super-admin --delete-auth ${authData.user.id} --confirm-delete-auth`,
    );
    throw new Error(`No se pudo crear el perfil: ${profileError.message}`);
  }

  console.log(`Super admin creado correctamente. user_id=${authData.user.id}`);
  return authData.user.id;
}

export async function repairProfile(admin, requestedUserId) {
  const userId = requestedUserId ?? readArgument("--repair-profile");

  if (!userId) {
    throw new Error("Indicá el user_id con --repair-profile.");
  }

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);

  if (authError || !authData.user) {
    throw new Error(`No se encontró el usuario de Auth: ${authError?.message ?? "error desconocido"}`);
  }

  const { error } = await admin.from("profiles").insert({
    id: authData.user.id,
    display_name: "Super admin reparado",
    role,
    is_active: true,
    must_change_password: true,
  });

  if (error) {
    throw new Error(`No se pudo reparar el perfil: ${error.message}`);
  }

  console.log(`Perfil reparado correctamente para user_id=${authData.user.id}`);
}

export async function deleteAuthUser(admin, requestedUserId, confirmed = hasArgument("--confirm-delete-auth")) {
  const userId = requestedUserId ?? readArgument("--delete-auth");

  if (!userId || !confirmed) {
    throw new Error(
      "La limpieza requiere --delete-auth <user_id> y --confirm-delete-auth de forma explícita.",
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(`No se pudo eliminar el usuario de Auth: ${error.message}`);
  }

  console.log(`Usuario de Auth eliminado correctamente. user_id=${userId}`);
}

export async function main() {
  const url = requireEnvironment("SUPABASE_URL");
  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  ensureAllowedEnvironment(url);

  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const mode = getMode();

  if (mode === "repair") {
    await repairProfile(admin);
    return;
  }

  if (mode === "delete") {
    await deleteAuthUser(admin);
    return;
  }

  await createSuperAdmin(admin);
}

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Falló el bootstrap.");
    process.exitCode = 1;
  });
}
