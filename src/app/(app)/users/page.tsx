import { redirect } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CreateUserForm } from "@/features/users/components/create-user-form";
import { UserList } from "@/features/users/components/user-list";
import { getManagedUsers } from "@/features/users/queries";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function UsersPage() {
  const profile = await requireActiveProfile();
  if (profile.role !== "super_admin" && profile.role !== "admin") redirect("/dashboard");
  const users = await getManagedUsers();
  const managedUsers = users ?? [];
  const activeUsers = managedUsers.filter((user) => user.isActive).length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-3" />
            Administración
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-display sm:text-3xl">Usuarios</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Gestioná perfiles, roles y accesos internos dentro de los límites de tu sesión.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="rounded-full border-success-foreground/30 bg-success/20 px-3 py-1.5 text-xs font-semibold text-success-foreground" variant="active">
            <Users aria-hidden="true" data-icon="inline-start" />
            {activeUsers} activos
          </Badge>
          <Badge className="rounded-full border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground" variant="outline">
            {managedUsers.length} perfiles
          </Badge>
        </div>
      </header>

      {profile.role === "super_admin" ? <CreateUserForm /> : null}
      <UserList currentRole={profile.role} users={managedUsers} />
    </main>
  );
}
