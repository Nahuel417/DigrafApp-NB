import { redirect } from "next/navigation";

import { CreateUserForm } from "@/features/users/components/create-user-form";
import { UserList } from "@/features/users/components/user-list";
import { getManagedUsers } from "@/features/users/queries";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function UsersPage() {
  const profile = await requireActiveProfile();
  if (profile.role !== "super_admin" && profile.role !== "admin") redirect("/dashboard");
  const users = await getManagedUsers();

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administración</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Usuarios</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Gestioná perfiles, roles y accesos internos dentro de los límites de tu sesión.
        </p>
      </header>

      {profile.role === "super_admin" ? <CreateUserForm /> : null}
      <UserList currentRole={profile.role} users={users ?? []} />
    </main>
  );
}
