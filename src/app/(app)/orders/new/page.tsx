import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

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
    <main className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            className="group inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
            href="/orders"
          >
            <ArrowLeft aria-hidden="true" className="size-3 transition-transform group-hover:-translate-x-0.5" />
            Pedidos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-display sm:text-3xl">Nuevo pedido</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Registrá un trabajo manualmente para incorporarlo a la etapa Pedido recibido.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          <Sparkles aria-hidden="true" className="size-3" />
          Entra a producción
        </span>
      </header>

      <div className="mt-6 sm:mt-8">
        <CreateOrderForm catalogs={catalogs} initialOrderDate={getOperatingDate(new Date())} />
      </div>
    </main>
  );
}
