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
const stagingProjectRef = "saajtpvsttiedthuhxou";
const stagingHost = `${stagingProjectRef}.supabase.co`;
const syntheticRoleDefinitions = [
  { role: "super_admin", envPrefix: "BOOTSTRAP_SUPER_ADMIN" },
  { role: "admin", envPrefix: "BOOTSTRAP_ADMIN" },
  { role: "attention", envPrefix: "BOOTSTRAP_ATTENTION" },
  { role: "employee", envPrefix: "BOOTSTRAP_EMPLOYEE" },
];
const emptyOperationalTables = [
  ["catalog_items", "id"],
  ["catalog_item_events", "id"],
  ["orders", "id"],
  ["order_financials", "order_id"],
  ["order_catalog_items", "id"],
  ["order_stage_events", "id"],
  ["order_change_events", "id"],
  ["order_comments", "id"],
];

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasArgument(name) {
  return process.argv.includes(name);
}

function requireEnvironment(name, alternatives = []) {
  for (const candidate of [name, ...alternatives]) {
    const value = process.env[candidate];
    if (value) return value;
  }

  throw new Error(`Falta configurar ${name}.`);
}

function parseOrThrow(schema, value) {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dato inválido.");
  }

  return parsed.data;
}

export function ensureAllowedEnvironment(url, projectRef, remoteConfirmed = hasArgument("--confirm-remote")) {
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL no es una URL válida.");
  }

  const hostname = parsedUrl.hostname;
  const isLocal = hostname === "127.0.0.1" || hostname === "localhost";

  if (isLocal) return;

  if (
    parsedUrl.protocol !== "https:"
    || hostname !== stagingHost
    || !["", "/"].includes(parsedUrl.pathname)
    || parsedUrl.search
    || parsedUrl.hash
    || projectRef !== stagingProjectRef
  ) {
    throw new Error("El bootstrap remoto solo permite el proyecto digraf-staging.");
  }

  if (!remoteConfirmed) {
    throw new Error(
      "El bootstrap remoto requiere --confirm-remote y autorización explícita para ese entorno.",
    );
  }
}

export function getBootstrapUsers(environment = process.env, requireSyntheticEmails = false) {
  return syntheticRoleDefinitions.map(({ role: targetRole, envPrefix }) => {
    const email = parseOrThrow(emailSchema, environment[`${envPrefix}_EMAIL`]);

    if (requireSyntheticEmails && !email.toLowerCase().endsWith("@example.test")) {
      throw new Error(`El email sintético de ${targetRole} debe usar @example.test.`);
    }

    return {
      email,
      displayName: parseOrThrow(displayNameSchema, environment[`${envPrefix}_NAME`]),
      password: parseOrThrow(passwordSchema, environment[`${envPrefix}_PASSWORD`]),
      role: targetRole,
    };
  });
}

export function isAnonymousProfilesAccessBlocked(rows, error) {
  if (error) return error.code === "42501";
  return (rows ?? []).length === 0;
}

function getMode() {
  if (hasArgument("--all-roles")) {
    if (hasArgument("--repair-profile") || hasArgument("--delete-auth")) {
      throw new Error("--all-roles no se puede combinar con modos de reparación o limpieza.");
    }

    return "all-roles";
  }

  if (hasArgument("--repair-profile")) {
    return "repair";
  }

  if (hasArgument("--delete-auth")) {
    return "delete";
  }

  return "create";
}

async function findAuthUserByEmail(admin, email) {
  const matches = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) throw new Error("No se pudieron consultar las cuentas de Auth.");

    matches.push(...data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase()));
    if (data.users.length < perPage) break;
  }

  if (matches.length > 1) {
    throw new Error(`Existen cuentas de Auth duplicadas para el rol configurado.`);
  }

  return matches[0] ?? null;
}

async function ensureSyntheticAuthUser(admin, user, existingAuthUser) {
  if (existingAuthUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
      email: user.email,
      password: user.password,
      email_confirm: true,
    });

    if (error || !data.user) throw new Error(`No se pudo actualizar Auth para ${user.role}.`);
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  });

  if (error || !data.user) throw new Error(`No se pudo crear Auth para ${user.role}.`);
  return data.user;
}

async function verifySyntheticAuthAndProfile(admin, publicClient, user, userId) {
  const [{ data: authData, error: authError }, { data: profile, error: profileError }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin
      .from("profiles")
      .select("role, is_active, must_change_password")
      .eq("id", userId)
      .single(),
  ]);

  if (authError || !authData.user?.email_confirmed_at) {
    throw new Error(`Auth no quedó confirmado para ${user.role}.`);
  }

  if (
    profileError
    || !profile
    || profile.role !== user.role
    || !profile.is_active
    || profile.must_change_password
  ) {
    throw new Error(`El perfil de ${user.role} no cumple el contrato sintético.`);
  }

  const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (signInError || signInData.user?.id !== userId) {
    throw new Error(`No se pudo autenticar la cuenta sintética de ${user.role}.`);
  }

  await publicClient.auth.signOut();
}

async function verifySyntheticRls(url, publishableKey, usersByRole) {
  const anonymousClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: anonymousProfiles, error: anonymousError } = await anonymousClient
    .from("profiles")
    .select("id");

  if (!isAnonymousProfilesAccessBlocked(anonymousProfiles, anonymousError)) {
    throw new Error("El acceso anónimo a profiles no está bloqueado.");
  }

  const expectedVisibleRoles = {
    super_admin: new Set(["super_admin", "admin", "attention", "employee"]),
    admin: new Set(["admin", "attention", "employee"]),
    attention: new Set(["attention"]),
    employee: new Set(["employee"]),
  };

  for (const user of usersByRole.values()) {
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    if (signInError) throw new Error(`No se pudo iniciar sesión como ${user.role}.`);

    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id, role");
    const visibleRoles = new Set((profiles ?? []).map((profile) => profile.role));

    if (profileError || visibleRoles.size !== expectedVisibleRoles[user.role].size) {
      throw new Error(`La visibilidad de profiles para ${user.role} no cumple RLS.`);
    }

    for (const visibleRole of expectedVisibleRoles[user.role]) {
      if (!visibleRoles.has(visibleRole)) {
        throw new Error(`La visibilidad de profiles para ${user.role} no cumple RLS.`);
      }
    }

    const { data: financials, error: financialError } = await client
      .from("order_financials")
      .select("order_id");

    if (financialError) throw new Error(`No se pudo verificar finanzas para ${user.role}.`);
    if (user.role === "employee" && (financials ?? []).length !== 0) {
      throw new Error("employee obtuvo acceso a datos financieros.");
    }

    if (user.role === "employee") {
      const { data: updatedProfiles, error: updateError } = await client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", user.id)
        .select("id");

      if (!updateError || (updatedProfiles ?? []).length !== 0) {
        throw new Error("employee pudo ejecutar una operación no autorizada.");
      }
    }

    await client.auth.signOut();
  }
}

async function verifyNoOperationalData(admin) {
  for (const [table, column] of emptyOperationalTables) {
    const { count, error } = await admin.from(table).select(column, { count: "exact", head: true });
    if (error) throw new Error(`No se pudo verificar ${table}.`);
    if ((count ?? 0) !== 0) throw new Error(`La tabla ${table} ya contiene datos.`);
  }

  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error("No se pudo verificar Storage.");
  if ((buckets ?? []).length !== 0) throw new Error("Storage ya contiene buckets.");
}

export async function bootstrapSyntheticUsers({ admin, url, publishableKey, users }) {
  const existingUsers = new Map();

  for (const user of users) {
    existingUsers.set(user.role, await findAuthUserByEmail(admin, user.email));
  }

  const usersByRole = new Map();

  for (const user of users) {
    const authUser = await ensureSyntheticAuthUser(admin, user, existingUsers.get(user.role));
    const { error: profileError } = await admin.from("profiles").upsert({
      id: authUser.id,
      display_name: user.displayName,
      role: user.role,
      is_active: true,
      must_change_password: false,
    }, { onConflict: "id" });

    if (profileError) throw new Error(`No se pudo actualizar el perfil de ${user.role}.`);

    const verifiedUser = { ...user, id: authUser.id };
    const verificationClient = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await verifySyntheticAuthAndProfile(admin, verificationClient, user, authUser.id);
    usersByRole.set(user.role, verifiedUser);
  }

  await verifySyntheticRls(url, publishableKey, usersByRole);
  await verifyNoOperationalData(admin);

  return usersByRole;
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
  const projectRef = process.env.SUPABASE_PROJECT_ID;
  ensureAllowedEnvironment(url, projectRef);

  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const mode = getMode();

  if (mode === "all-roles") {
    const publishableKey = requireEnvironment(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ["SUPABASE_PUBLISHABLE_KEY"],
    );
    const users = getBootstrapUsers(process.env, new URL(url).hostname === stagingHost);
    await bootstrapSyntheticUsers({
      admin,
      url,
      publishableKey,
      users,
    });
    console.log("Bootstrap sintético verificado: super_admin, admin, attention, employee.");
    return;
  }

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
