"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CalendarDays, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";

import type { ArchiveFilters } from "../archive-queries";

type ArchiveTab = "delivered" | "cancelled";

function buildArchiveHref(tab: ArchiveTab, filters: ArchiveFilters): string {
  const params = new URLSearchParams({ tab });
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return `/orders/archives?${params.toString()}`;
}

export function ArchiveFilterControls({ tab, filters, hasInvalidDateRange }: { tab: ArchiveTab; filters: ArchiveFilters; hasInvalidDateRange: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.search ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const hasActiveFilters = Boolean(search.trim() || from || to);

  function navigate(nextFilters: ArchiveFilters) {
    router.push(buildArchiveHref(tab, nextFilters));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ search: search.trim() || undefined, from, to });
  }

  function updateDateRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    navigate({ search: search.trim() || undefined, from: nextFrom, to: nextTo });
  }

  function clearFilters() {
    setSearch("");
    setFrom("");
    setTo("");
    navigate({});
  }

  return (
    <div className="flex flex-wrap items-start gap-2" data-testid="archive-filters">
      <details className="group/filter relative" open={Boolean(filters.search)}>
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <Search aria-hidden="true" className="size-3.5 text-primary" />
          Buscar
          <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform duration-150 group-open/filter:rotate-180 motion-reduce:transition-none" />
        </summary>
        <form className="absolute left-0 top-full z-20 mt-2 flex w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-xl border border-border bg-card p-3 shadow-lg" onSubmit={submitSearch} role="search">
          <label className="relative min-w-0 flex-1" htmlFor="archive-search">
            <span className="sr-only">Buscar por cliente o pedido</span>
            <Input autoFocus={Boolean(filters.search)} className="h-9 rounded-lg bg-background pr-2" id="archive-search" onChange={(event) => setSearch(event.target.value)} placeholder="Cliente o PED-000001" value={search} />
          </label>
          <Button className="h-9 shrink-0 rounded-lg px-3" type="submit">Buscar</Button>
        </form>
      </details>
      <details className="group/filter relative">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <CalendarDays aria-hidden="true" className="size-3.5 text-primary" />
          Fecha
          <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform duration-150 group-open/filter:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="absolute left-0 top-full z-20 mt-2 grid w-[min(30rem,calc(100vw-2rem))] gap-3 rounded-xl border border-border bg-card p-3 shadow-lg" onPointerDown={(event) => event.stopPropagation()}>
          <p className="text-xs font-medium text-foreground">Rango de fecha</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-[11px] text-muted-foreground" htmlFor="archive-from">
              Desde
              <DatePickerField id="archive-from" label="la fecha Desde" max={to || undefined} name="from" onChange={(value) => updateDateRange(value, to)} required={false} triggerLabel="Abrir calendario Desde" value={from} />
            </label>
            <label className="grid min-w-0 gap-1 text-[11px] text-muted-foreground" htmlFor="archive-to">
              Hasta
              <DatePickerField align="end" id="archive-to" label="la fecha Hasta" min={from || undefined} name="to" onChange={(value) => updateDateRange(from, value)} required={false} triggerLabel="Abrir calendario Hasta" value={to} />
            </label>
          </div>
          {hasInvalidDateRange ? <p className="text-xs text-error" role="alert">La fecha Desde no puede superar Hasta.</p> : null}
        </div>
      </details>
      {hasActiveFilters ? <Button className="h-9 rounded-xl px-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={clearFilters} type="button" variant="ghost">Limpiar filtros</Button> : null}
    </div>
  );
}
