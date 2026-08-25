import Link from "next/link";

import { Button } from "@/components/ui/button";

export type ArchivePaginationProps = {
  basePath: string;
  pageParam?: string;
  extraParams?: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  ariaLabel?: string;
};

export function buildArchiveHref(basePath: string, pageParam: string, page: number, extraParams: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (extraParams.tab !== undefined) params.set("tab", extraParams.tab);
  params.set(pageParam, String(page));
  for (const [key, value] of Object.entries(extraParams)) {
    if (key === "tab") continue;
    if (value !== undefined) params.set(key, value);
  }
  return `${basePath}?${params.toString()}`;
}

export function ArchivePagination({ ariaLabel = "Paginación del Archivo", basePath, pageParam = "page", extraParams = {}, page, pageSize, total, totalPages }: ArchivePaginationProps) {
  if (total <= pageSize) return null;
  const isFirst = page <= 1;
  const isLast = page >= totalPages;
  const prevHref = buildArchiveHref(basePath, pageParam, page - 1, extraParams);
  const nextHref = buildArchiveHref(basePath, pageParam, page + 1, extraParams);
  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">Página {page} de {totalPages} · Total {total} registros</p>
      <div className="flex gap-2">
        {isFirst ? (
          <Button aria-label="Anterior" disabled variant="outline">Anterior</Button>
        ) : (
          <Button asChild variant="outline"><Link aria-label="Anterior" href={prevHref}>Anterior</Link></Button>
        )}
        {isLast ? (
          <Button aria-label="Siguiente" disabled variant="outline">Siguiente</Button>
        ) : (
          <Button asChild variant="outline"><Link aria-label="Siguiente" href={nextHref}>Siguiente</Link></Button>
        )}
      </div>
    </nav>
  );
}
