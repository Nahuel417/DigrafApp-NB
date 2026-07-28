import { redirect } from "next/navigation";

import { CreateOrderForm } from "@/features/orders/components/create-order-form";
import { getOrderFormCatalogs } from "@/features/orders/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { getOperatingDate } from "@/lib/dates/operating-day";
import { canCreateManualOrder } from "@/lib/auth/permissions";

export default async function NewOrderPage() {
  const profile = await requireActiveProfile();
  if (!canCreateManualOrder(profile.role)) redirect("/dashboard");

  const catalogs = await getOrderFormCatalogs();
  if (!catalogs) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Pedidos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Nuevo pedido</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Registrá un trabajo manualmente para incorporarlo a la etapa Pedido recibido.
        </p>
      </header>

      <CreateOrderForm catalogs={catalogs} initialOrderDate={getOperatingDate(new Date())} />
    </main>
  );
}
