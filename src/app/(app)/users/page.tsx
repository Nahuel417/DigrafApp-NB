import { redirect } from "next/navigation";

import { CreateUserForm } from "@/features/users/components/create-user-form";
import { UserList } from "@/features/users/components/user-list";
import { getManagedUsers } from "@/features/users/queries";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function UsersPage() {
  const profile = await requireActiveProfile();
  if (profile.role !== "super_admin" && profile.role !== "admin") redirect("/dashboard");
  const users = await getManagedUsers();

  return <main className="flex flex-col gap-8 py-10"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Administración</p><h1 className="mt-2 text-4xl font-black uppercase">Usuarios</h1></div>{profile.role === "super_admin" ? <CreateUserForm /> : null}<UserList currentRole={profile.role} users={users ?? []} /></main>;
}
