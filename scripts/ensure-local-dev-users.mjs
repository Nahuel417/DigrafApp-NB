import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "LOCAL_DEV_USERS_PASSWORD debe tener al menos 8 caracteres.")
  .regex(/\d/, "LOCAL_DEV_USERS_PASSWORD debe incluir al menos un número.");

const userSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(2).max(100),
  role: z.enum(["super_admin", "admin", "attention", "employee"]),
});

export const LOCAL_DEV_USERS = [
  { email: "superadmin@digraf.local", displayName: "Super admin local", role: "super_admin" },
  { email: "admin@digraf.local", displayName: "Admin local", role: "admin" },
  { email: "atencion@digraf.local", displayName: "Atención local", role: "attention" },
  { email: "empleado@digraf.local", displayName: "Empleado local", role: "employee" },
];

function requireEnvironment(name, alternatives = []) {
  for (const candidate of [name, ...alternatives]) {
    const value = process.env[candidate];
    if (value) return value;
  }

  throw new Error(`Falta configurar ${name} en .env.local.`);
}

export function assertLocalSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL no es una URL válida.");
  }

  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname)) {
    throw new Error("db:users solo puede ejecutarse contra Supabase local.");
  }

  return url.toString().replace(/\/$/, "");
}

async function findAuthUserByEmail(admin, email) {
  const matches = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`No se pudieron consultar usuarios de Auth: ${error.message}`);

    matches.push(...data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase()));
    if (data.users.length < perPage) break;
  }

  if (matches.length > 1) {
    throw new Error(`Existen usuarios de Auth duplicados para ${email}; se requiere revisión manual.`);
  }

  return matches[0] ?? null;
}

async function ensureAuthUser(admin, user, password) {
  const existing = await findAuthUserByEmail(admin, user.email);

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email: user.email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`No se pudo restaurar Auth para ${user.email}: ${error?.message ?? "error desconocido"}`);
    }
    return { authUser: data.user, created: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear Auth para ${user.email}: ${error?.message ?? "error desconocido"}`);
  }
  return { authUser: data.user, created: true };
}

async function ensureProfile(admin, authUser, user) {
  const { error } = await admin.from("profiles").upsert({
    id: authUser.id,
    display_name: user.displayName,
    role: user.role,
    is_active: true,
    must_change_password: false,
  }, { onConflict: "id" });

  if (error) throw new Error(`No se pudo restaurar el perfil para ${user.email}: ${error.message}`);
}

async function verifyUser({ admin, password, publishableKey, url, user, userId }) {
  const [{ data: authData, error: authError }, { data: profile, error: profileError }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("role, is_active, must_change_password").eq("id", userId).single(),
  ]);

  if (authError || !authData.user || !authData.user.email_confirmed_at) {
    throw new Error(`Auth no quedó confirmado para ${user.email}.`);
  }
  if (profileError || !profile) throw new Error(`No se pudo verificar el perfil para ${user.email}.`);
  if (profile.role !== user.role || !profile.is_active || profile.must_change_password) {
    throw new Error(`El perfil restaurado no cumple el contrato para ${user.email}.`);
  }

  const publicClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInError || signInData.user?.id !== userId) {
    throw new Error(`No se pudo autenticar la cuenta restaurada ${user.email}.`);
  }
  await publicClient.auth.signOut();
}

export async function ensureLocalDevUsers({
  logger = console,
  password,
  publishableKey,
  serviceRoleKey,
  url,
  users = LOCAL_DEV_USERS,
}) {
  const localUrl = assertLocalSupabaseUrl(url);
  const validPassword = passwordSchema.parse(password);
  const validUsers = users.map((user) => userSchema.parse(user));
  const admin = createClient(localUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const results = [];

  for (const user of validUsers) {
    const { authUser, created } = await ensureAuthUser(admin, user, validPassword);
    await ensureProfile(admin, authUser, user);
    await verifyUser({
      admin,
      password: validPassword,
      publishableKey,
      url: localUrl,
      user,
      userId: authUser.id,
    });
    logger.log(`${user.email} (${user.role}): ${created ? "creada" : "restaurada"} y verificada.`);
    results.push({ id: authUser.id, email: user.email, role: user.role, created });
  }

  logger.log(`${results.length} cuentas locales listas para desarrollo.`);
  return results;
}

export async function main() {
  await ensureLocalDevUsers({
    url: requireEnvironment("SUPABASE_URL"),
    serviceRoleKey: requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    publishableKey: requireEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ["SUPABASE_PUBLISHABLE_KEY"]),
    password: requireEnvironment("LOCAL_DEV_USERS_PASSWORD"),
  });
}

const isExecutedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Falló la restauración de cuentas locales.");
    process.exitCode = 1;
  });
}
