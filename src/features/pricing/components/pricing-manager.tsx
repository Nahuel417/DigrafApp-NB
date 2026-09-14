"use client";

import { AlertCircle, Calculator, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardPaste, FileSpreadsheet, FileText, Minus, Pencil, Plus, Power, Printer, Search, Tags, Trash2, Upload } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import type { MutationState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

import { deletePriceProductAction, importPricesAction, previewPricesAction, upsertPriceProductAction, type PriceImportState } from "../actions";
import { calculateQuote, formatQuoteCents } from "../calculation";
import { PRICE_GROUPS, type ImportedPrice, type PriceGroup } from "../importer";
import type { PriceList, PriceProduct } from "../queries";

const labels: Record<PriceGroup, string> = {
  adults: "Adultos", children: "Niños", flags: "Banderas", additions: "Adicionales",
};
const emptyState: MutationState = {};
const PRODUCT_PAGE_SIZE = 10;
const buttonMotion = "transition-all duration-200 ease-out active:scale-[0.98] [&_svg]:transition-transform [&_svg]:duration-150 [&_svg]:ease-out hover:[&_svg]:-translate-y-px hover:[&_svg]:scale-105 active:[&_svg]:translate-y-0 active:[&_svg]:scale-95 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:[&_svg]:transform-none motion-reduce:[&_svg]:transition-none";

function errorsFor(state: MutationState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

function Feedback({ state }: { state: MutationState }) {
  if (!state.message || state.fieldErrors) return null;
  const isError = state.status === "error";
  return (
    <Alert aria-live="polite" className="my-2 gap-2 rounded-lg px-2.5 py-1.5 text-[11px] leading-4 [&>svg]:mt-0 [&>svg]:size-3.5" role={isError ? "alert" : "status"} variant={isError ? "destructive" : "success"}>
      {isError ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <AlertDescription className="text-[11px] leading-4">{state.message}</AlertDescription>
    </Alert>
  );
}

function ImportPreview({ rows, current }: { rows: ImportedPrice[]; current: PriceProduct[] }) {
  const byCode = new Map(current.filter((product) => product.code).map((product) => [product.code!.toLowerCase(), product]));
  const byName = new Map(current.map((product) => [product.name.trim().toLowerCase(), product]));
  const statuses = rows.map((row) => {
    const existing = row.code ? byCode.get(row.code.toLowerCase()) : byName.get(row.name.trim().toLowerCase());
    if (!existing) return { row, status: "Alta" };
    const changed = existing.group !== row.group || existing.name !== row.name || existing.unit !== row.unit || Number(existing.price) !== Number(row.price) || (row.active !== undefined && existing.active !== row.active);
    return { row, status: changed ? "Modificación" : "Sin cambios" };
  });
  const counts = statuses.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Vista previa antes de aplicar cambios</p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Badge variant="active">{counts.Alta ?? 0} altas</Badge>
          <Badge variant="outline">{counts.Modificación ?? 0} modificaciones</Badge>
          <Badge variant="secondary">{counts["Sin cambios"] ?? 0} sin cambios</Badge>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-[56rem] w-full table-fixed text-left text-xs">
          <caption className="sr-only">Vista previa de precios</caption>
          <thead className="bg-surface-muted text-[10px] uppercase tracking-label text-muted-foreground">
            <tr className="border-b border-border"><th className="w-32 px-3 py-2.5">Estado</th><th className="w-36 px-3 py-2.5">Código</th><th className="w-32 px-3 py-2.5">Grupo</th><th className="px-3 py-2.5">Nombre</th><th className="w-36 px-3 py-2.5">Unidad</th><th className="w-32 px-3 py-2.5 text-right">Precio</th></tr>
          </thead>
          <tbody>
            {statuses.map(({ row, status }, index) => (
              <tr className="border-b border-border last:border-0" key={`${row.code ?? "sin-codigo"}-${row.name}-${index}`}>
                <td className="whitespace-nowrap px-3 py-2.5"><Badge variant={status === "Sin cambios" ? "secondary" : status === "Alta" ? "active" : "outline"}>{status}</Badge></td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums">{row.code ?? "Sin código"}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{labels[row.group]}</td>
                <td className="break-words px-3 py-2.5 font-medium">{row.name}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{row.unit === "metro_lineal" ? "Metro lineal" : "Unidad"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">{row.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportPanel({ current }: { current: PriceProduct[] }) {
  const [preview, previewAction] = useActionState<PriceImportState, FormData>(previewPricesAction, {});
  const [state, action] = useActionState<PriceImportState, FormData>(importPricesAction, {});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!preview.preview || preview.status !== "success") return;
    const frame = window.requestAnimationFrame(() => setPreviewOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [preview.preview, preview.status]);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="grid-paper flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Upload aria-hidden="true" className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Carga masiva</p>
          <h2 className="text-sm font-semibold tracking-tight">Importar precios</h2>
        </div>
      </header>
      <div className="flex flex-col gap-3 p-4">
        <form action={previewAction} className="flex flex-col gap-3">
          <label className="grid min-h-28 cursor-pointer place-items-center gap-1.5 rounded-2xl border border-dashed border-primary/40 bg-primary/[0.025] px-4 py-5 text-center transition-colors duration-200 ease-out hover:border-primary/70 hover:bg-primary/5 motion-reduce:transition-none" htmlFor="price-file">
            <FileSpreadsheet aria-hidden="true" className="size-6 text-primary" />
            <span className="text-xs font-medium">Subir Excel, PDF o Word</span>
            <span className="text-[10px] leading-4 text-muted-foreground">Detecta producto, grupo, unidad y precio</span>
          </label>
          <Input accept=".xlsx,.docx,.pdf" className="sr-only" id="price-file" name="file" onChange={(event) => event.currentTarget.form?.requestSubmit()} type="file" />
          <Button aria-controls="pasted-price-panel" aria-expanded={pasteOpen} className={cn("group/paste w-full rounded-full", buttonMotion)} onClick={() => setPasteOpen((open) => !open)} size="sm" type="button" variant="outline"><ClipboardPaste aria-hidden="true" data-icon="inline-start" />Pegar filas manualmente<ChevronDown aria-hidden="true" className={cn("ml-auto transition-transform duration-200 motion-reduce:transition-none", pasteOpen && "rotate-180")} data-icon="inline-end" /></Button>
          <div aria-hidden={!pasteOpen} className={cn("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", pasteOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} id="pasted-price-panel" inert={!pasteOpen}>
            <div className="overflow-hidden">
              <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-3">
                <Field><FieldLabel className="sr-only" htmlFor="pasted-prices">Filas de precios</FieldLabel><Textarea className="min-h-24 resize-y rounded-xl bg-background text-xs" id="pasted-prices" name="pasted" placeholder="Camiseta sola | Adultos | Unidad | $14.000" /></Field>
                <SubmitButton className={cn("w-full rounded-xl", buttonMotion)} pendingLabel="Validando filas">Importar filas pegadas</SubmitButton>
              </div>
            </div>
          </div>
        </form>
        {preview.status === "error" ? <Feedback state={preview} /> : null}
        {preview.preview && state.status !== "success" ? (
          <>
            <Button className={cn("w-full rounded-xl", buttonMotion)} onClick={() => setPreviewOpen(true)} type="button" variant="outline">Revisar {preview.preview.length} filas</Button>
            <AlertDialog onOpenChange={setPreviewOpen} open={previewOpen}>
              <AlertDialogContent className="gap-0 overflow-hidden p-0 sm:max-w-6xl">
                <AlertDialogHeader className="grid-paper border-b border-border px-6 py-5 text-left">
                  <AlertDialogTitle>Revisar importación</AlertDialogTitle>
                  <AlertDialogDescription>Confirmá los cambios antes de aplicarlos a la lista de precios.</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="max-h-[min(65vh,40rem)] overflow-y-auto px-6 py-5">
                  <ImportPreview current={current} rows={preview.preview} />
                </div>
                <AlertDialogFooter className="border-t border-border bg-surface-muted/30 px-6 py-4 sm:justify-between">
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  <form action={action} className="w-full sm:w-auto">
                    <input name="rows" type="hidden" value={JSON.stringify(preview.preview)} />
                    <SubmitButton className={cn("w-full sm:min-w-48", buttonMotion)} pendingLabel="Importando">Confirmar importación</SubmitButton>
                  </form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
        <Feedback state={state} />
      </div>
    </section>
  );
}

function ProductRow({ deleteAction, product }: { deleteAction: (formData: FormData) => void; product: PriceProduct }) {
  const [state, action] = useActionState(upsertPriceProductAction, emptyState);
  const [editing, setEditing] = useState(false);
  const nameErrors = errorsFor(state, "name");
  const codeErrors = errorsFor(state, "code");
  const groupErrors = errorsFor(state, "group");
  const unitErrors = errorsFor(state, "unit");
  const priceErrors = errorsFor(state, "price");
  const editOpen = editing || state.status === "error";
  return (
    <li className="group border-b border-border last:border-b-0">
      <div className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted/35 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{product.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            <span>{labels[product.group]} · {product.unit === "metro_lineal" ? "por metro lineal" : "por unidad"}{product.code ? ` · ${product.code}` : ""}</span>
            {!product.active ? <Badge className="rounded-full px-1.5 py-0 text-[10px] font-medium" variant="inactive">Inactivo</Badge> : null}
          </div>
        </div>
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">$ {Number(product.price).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
        <div className="flex shrink-0 gap-1.5">
          <Button aria-controls={`edit-${product.id}`} aria-expanded={editOpen} aria-label={`Editar ${product.name}`} className={cn("size-9 rounded-full border-border text-muted-foreground shadow-none hover:border-primary/40 hover:text-primary", buttonMotion)} onClick={() => setEditing((open) => !open)} size="icon" type="button" variant="outline"><Pencil aria-hidden="true" /></Button>
          <form action={action}><input name="id" type="hidden" value={product.id} /><input name="code" type="hidden" value={product.code ?? ""} /><input name="group" type="hidden" value={product.group} /><input name="name" type="hidden" value={product.name} /><input name="unit" type="hidden" value={product.unit} /><input name="price" type="hidden" value={product.price} /><input name="active" type="hidden" value={String(!product.active)} /><SubmitButton aria-label={`${product.active ? "Desactivar" : "Activar"} ${product.name}`} className={cn("size-9 rounded-full border-border text-muted-foreground shadow-none hover:border-primary/40 hover:text-primary", buttonMotion)} pendingLabel="Actualizando" size="icon" title={product.active ? "Desactivar" : "Activar"} variant="outline"><Power aria-hidden="true" /></SubmitButton></form>
          <AlertDialog><AlertDialogTrigger asChild><Button aria-label={`Eliminar ${product.name}`} className={cn("size-9 rounded-full border-border text-muted-foreground shadow-none hover:border-destructive/40 hover:text-destructive", buttonMotion)} size="icon" variant="outline"><Trash2 aria-hidden="true" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar precio</AlertDialogTitle><AlertDialogDescription>Vas a eliminar definitivamente “{product.name}”{product.code ? ` (${product.code})` : ""}.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><form action={deleteAction}><input name="id" type="hidden" value={product.id} /><AlertDialogAction type="submit" variant="destructive">Eliminar definitivamente</AlertDialogAction></form></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div>
      </div>
      <div aria-hidden={!editOpen} className={cn("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", editOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} id={`edit-${product.id}`} inert={!editOpen}>
        <div className="overflow-hidden">
          <form action={action} className="grid gap-3 border-t border-border bg-surface-muted/20 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3 lg:items-end">
            <input name="id" type="hidden" value={product.id} />
            <Field className="gap-1" data-invalid={Boolean(nameErrors?.length)}><FieldLabel className="text-[10px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`name-${product.id}`}>Nombre</FieldLabel><Input aria-describedby={nameErrors?.length ? `name-${product.id}-error` : undefined} aria-invalid={Boolean(nameErrors?.length)} defaultValue={product.name} id={`name-${product.id}`} name="name" /><FieldError errors={nameErrors} id={`name-${product.id}-error`} /></Field>
            <Field className="gap-1" data-invalid={Boolean(codeErrors?.length)}><FieldLabel className="text-[10px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`code-${product.id}`}>Código</FieldLabel><Input aria-describedby={codeErrors?.length ? `code-${product.id}-error` : undefined} aria-invalid={Boolean(codeErrors?.length)} defaultValue={product.code ?? ""} id={`code-${product.id}`} name="code" placeholder="Opcional" /><FieldError errors={codeErrors} id={`code-${product.id}-error`} /></Field>
            <Field className="gap-1" data-invalid={Boolean(groupErrors?.length)}><FieldLabel className="text-[10px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`group-${product.id}`}>Grupo</FieldLabel><Select defaultValue={product.group} name="group"><SelectTrigger aria-describedby={groupErrors?.length ? `group-${product.id}-error` : undefined} aria-invalid={Boolean(groupErrors?.length)} id={`group-${product.id}`}><SelectValue /></SelectTrigger><SelectContent>{PRICE_GROUPS.map((group) => <SelectItem key={group} value={group}>{labels[group]}</SelectItem>)}</SelectContent></Select><FieldError errors={groupErrors} id={`group-${product.id}-error`} /></Field>
            <Field className="gap-1" data-invalid={Boolean(unitErrors?.length)}><FieldLabel className="text-[10px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`unit-${product.id}`}>Unidad</FieldLabel><Select defaultValue={product.unit} name="unit"><SelectTrigger aria-describedby={unitErrors?.length ? `unit-${product.id}-error` : undefined} aria-invalid={Boolean(unitErrors?.length)} id={`unit-${product.id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unidad">Unidad</SelectItem><SelectItem value="metro_lineal">Metro lineal</SelectItem></SelectContent></Select><FieldError errors={unitErrors} id={`unit-${product.id}-error`} /></Field>
            <Field className="gap-1" data-invalid={Boolean(priceErrors?.length)}><FieldLabel className="text-[10px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`price-${product.id}`}>Precio ARS</FieldLabel><Input aria-describedby={priceErrors?.length ? `price-${product.id}-error` : undefined} aria-invalid={Boolean(priceErrors?.length)} defaultValue={product.price} id={`price-${product.id}`} inputMode="decimal" name="price" /><FieldError errors={priceErrors} id={`price-${product.id}-error`} /></Field>
            <input name="active" type="hidden" value={String(product.active)} />
            <SubmitButton className={buttonMotion} pendingLabel="Guardando"><Pencil aria-hidden="true" data-icon="inline-start" />Guardar</SubmitButton>
          </form>
        </div>
      </div>
      <div className="px-4 sm:px-5"><Feedback state={state} /></div>
    </li>
  );
}

function QuoteBuilder({ products, onLinesChange }: { products: PriceProduct[]; onLinesChange: (count: number) => void }) {
  const active = products.filter((product) => product.active);
  const [productId, setProductId] = useState(active[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [validity, setValidity] = useState("15");
  const [lines, setLines] = useState<Array<{ product: PriceProduct; quantity: string }>>([]);
  const [client, setClient] = useState("");
  const [team, setTeam] = useState("");
  const [phone, setPhone] = useState("");
  const [dni, setDni] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const productSearchRef = useRef<HTMLInputElement>(null);
  function updateLines(next: Array<{ product: PriceProduct; quantity: string }>) {
    setLines(next);
    onLinesChange(next.length);
  }
  function changeLineQuantity(index: number, change: number) {
    updateLines(lines.map((line, itemIndex) => itemIndex === index ? { ...line, quantity: String(Math.max(1, (Number(line.quantity) || 1) + change)) } : line));
  }
  const selected = active.find((product) => product.id === productId);
  const filtered = active.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()));
  function updateProductSearch(value: string) {
    setSearch(value);
    if (selected && !selected.name.toLowerCase().includes(value.toLowerCase())) setProductId("");
  }
  function selectProduct(value: string) {
    setProductId(value);
    setSearch("");
  }
  const result = useMemo(() => { try { return calculateQuote(lines.map((line) => ({ name: line.product.name, unit: line.product.unit, unitPrice: line.product.price, quantity: line.quantity })), discount); } catch { return null; } }, [discount, lines]);

  async function printQuote() {
    if (!result || !lines.length || pending) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setError("El navegador bloqueó la ventana. Permití ventanas emergentes para abrir el PDF."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/commercial/quote", { body: JSON.stringify({ lines: lines.map((line) => ({ id: line.product.id, quantity: line.quantity })), discount, client, team, phone, dni, notes, validity }), headers: { "Content-Type": "application/json" }, method: "POST" });
      if (!response.ok) throw new Error("No se pudo generar el PDF. Revisá los datos e intentá nuevamente.");
      const url = URL.createObjectURL(await response.blob());
      popup.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      popup.close(); setError(caught instanceof Error ? caught.message : "No se pudo generar el PDF.");
    } finally { setPending(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="quote-data-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <header className="grid-paper flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText aria-hidden="true" className="size-[18px]" /></span>
            <div><p className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Datos del presupuesto</p><h2 className="text-sm font-semibold tracking-tight" id="quote-data-title">Cliente y condiciones</h2></div>
          </header>
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field><FieldLabel htmlFor="quote-client">Cliente (opcional)</FieldLabel><Input className="h-10 rounded-xl bg-background" id="quote-client" onChange={(event) => setClient(event.target.value)} placeholder="Nombre" value={client} /></Field>
            <Field><FieldLabel htmlFor="quote-team">Equipo / Institución (opcional)</FieldLabel><Input className="h-10 rounded-xl bg-background" id="quote-team" onChange={(event) => setTeam(event.target.value)} placeholder="Opcional" value={team} /></Field>
            <Field><FieldLabel htmlFor="quote-validity">Validez (días)</FieldLabel><Input className="h-10 rounded-xl bg-background font-mono tabular-nums" id="quote-validity" max="365" min="1" onChange={(event) => setValidity(event.target.value)} type="number" value={validity} /></Field>
            <Field><FieldLabel htmlFor="quote-phone">Teléfono (opcional)</FieldLabel><Input className="h-10 rounded-xl bg-background" id="quote-phone" onChange={(event) => setPhone(event.target.value)} value={phone} /></Field>
            <Field><FieldLabel htmlFor="quote-dni">DNI (opcional)</FieldLabel><Input className="h-10 rounded-xl bg-background" id="quote-dni" onChange={(event) => setDni(event.target.value)} value={dni} /></Field>
          </div>
        </section>

        <section aria-labelledby="quote-products-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <header className="grid-paper flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Calculator aria-hidden="true" className="size-[18px]" /></span>
            <div><p className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Detalle principal</p><h2 className="text-sm font-semibold tracking-tight" id="quote-products-title">Ítems cotizados <span className="text-xs font-normal text-muted-foreground">({lines.length} líneas)</span></h2></div>
          </header>
          <div className="grid gap-3 border-b border-border p-5 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-end">
            <Field><FieldLabel htmlFor="quote-product">Producto</FieldLabel><Select onOpenChange={(open) => { if (open) { setSearch(""); window.requestAnimationFrame(() => productSearchRef.current?.focus()); } }} onValueChange={selectProduct} value={productId}><SelectTrigger className="h-10 rounded-xl bg-background" id="quote-product"><SelectValue placeholder="Elegí un producto" /></SelectTrigger><SelectContent className="p-0"><div className="border-b border-border p-2"><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar producto por nombre" autoComplete="off" className="h-9 rounded-lg bg-background pl-8 text-xs" onChange={(event) => updateProductSearch(event.target.value)} onKeyDown={(event) => { if (event.key !== "Escape") event.stopPropagation(); }} placeholder="Buscar por nombre" ref={productSearchRef} type="search" value={search} /></div></div>{filtered.length ? <SelectGroup>{filtered.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}{product.code ? ` · ${product.code}` : ""}</SelectItem>)}</SelectGroup> : <p className="px-3 py-6 text-center text-xs text-muted-foreground">No hay productos que coincidan.</p>}</SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="quote-quantity">Cantidad</FieldLabel><Input className="h-10 rounded-xl bg-background font-mono tabular-nums" id="quote-quantity" inputMode="decimal" onChange={(event) => setQuantity(event.target.value)} value={quantity} /></Field>
            <Button className={cn("h-10", buttonMotion)} disabled={!selected} onClick={() => { if (selected) { updateLines([...lines, { product: selected, quantity }]); setQuantity("1"); } }} type="button"><Plus aria-hidden="true" data-icon="inline-start" />Agregar</Button>
          </div>
          <div className="divide-y divide-border">
            {lines.map((line, index) => (
              <div className="grid min-h-16 items-center gap-3 px-5 py-3 transition-colors duration-200 ease-out hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_7rem_auto] sm:px-6" key={`${line.product.id}-${index}`}>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{line.product.name}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{line.product.unit === "metro_lineal" ? "Metro lineal" : "Unidad"} · $ {Number(line.product.price).toLocaleString("es-AR")} cada uno</p></div>
                <div className="flex items-center gap-1.5"><Button aria-label={`Reducir cantidad de ${line.product.name}`} className={cn("size-8 rounded-full", buttonMotion)} disabled={Number(line.quantity) <= 1} onClick={() => changeLineQuantity(index, -1)} size="icon" type="button" variant="outline"><Minus aria-hidden="true" /></Button><Field className="w-14 gap-0"><FieldLabel className="sr-only" htmlFor={`line-${index}`}>Cantidad de {line.product.name}</FieldLabel><Input className="h-8 rounded-xl bg-background px-2 text-center font-mono text-xs tabular-nums" id={`line-${index}`} inputMode="decimal" onChange={(event) => updateLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} value={line.quantity} /></Field><Button aria-label={`Aumentar cantidad de ${line.product.name}`} className={cn("size-8 rounded-full", buttonMotion)} onClick={() => changeLineQuantity(index, 1)} size="icon" type="button" variant="outline"><Plus aria-hidden="true" /></Button></div>
                <p className="font-mono text-sm font-semibold tabular-nums sm:text-right">{result ? `$ ${formatQuoteCents(result.lines[index]?.lineTotalCents ?? BigInt(0))}` : "—"}</p>
                <Button aria-label={`Quitar ${line.product.name}`} className={cn("size-8 rounded-full text-muted-foreground hover:text-destructive", buttonMotion)} onClick={() => updateLines(lines.filter((_, itemIndex) => itemIndex !== index))} size="icon" type="button" variant="outline"><Trash2 aria-hidden="true" /></Button>
              </div>
            ))}
            {lines.length === 0 ? <div className="m-5 grid min-h-48 place-items-center gap-2 rounded-xl border border-dashed border-border bg-surface-muted/30 px-6 py-10 text-center"><Calculator aria-hidden="true" className="size-6 text-muted-foreground/60" /><p className="text-sm text-muted-foreground">Elegí productos de la lista para armar el presupuesto.</p></div> : null}
          </div>
          <div className="border-t border-border p-5 sm:p-6"><Field><FieldLabel className="text-[10px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="quote-notes">Notas para el cliente</FieldLabel><Textarea className="min-h-28 rounded-xl bg-background" id="quote-notes" onChange={(event) => setNotes(event.target.value)} placeholder="Tiempos de producción, condiciones de pago, seña requerida…" rows={4} value={notes} /></Field></div>
        </section>
      </div>

      <aside aria-label="Resumen de cotización" className="h-fit overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:sticky lg:top-6">
        <div className="grid-paper border-b border-border px-5 py-5">
          <p className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Resumen</p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-display tabular-nums">{result ? `$ ${formatQuoteCents(result.totalCents)}` : "—"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{lines.length} líneas en el presupuesto</p>
        </div>
        <div className="flex flex-col gap-3 p-5 text-sm">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono tabular-nums">{result ? `$ ${formatQuoteCents(result.subtotalCents)}` : "—"}</span></div>
          <Field><FieldLabel htmlFor="quote-discount">Descuento (%)</FieldLabel><Input className="h-10 rounded-xl bg-background font-mono tabular-nums" id="quote-discount" inputMode="decimal" max="100" min="0" onChange={(event) => setDiscount(event.target.value)} value={discount} /></Field>
          {result ? <><div className="flex items-center justify-between"><span className="text-muted-foreground">Descuento</span><span className="font-mono tabular-nums">− $ {formatQuoteCents(result.discountCents)}</span></div><div className="flex items-center justify-between border-t border-border pt-3 font-semibold"><span>Total</span><span className="font-mono tabular-nums">$ {formatQuoteCents(result.totalCents)}</span></div></> : <p className="text-sm text-destructive">Revisá cantidades y descuento.</p>}
          <p className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-3 text-[11px] text-muted-foreground">Presupuesto válido por {Number(validity) || 0} días{client ? ` · ${client}` : ""}{team ? ` · ${team}` : ""}.</p>
          <Button className={cn("w-full", buttonMotion)} disabled={pending || !lines.length} onClick={printQuote} type="button"><Printer aria-hidden="true" data-icon="inline-start" />{pending ? "Generando PDF…" : "Imprimir o guardar PDF"}</Button>
          {error ? <p aria-live="polite" className="text-sm text-destructive">{error}</p> : null}
        </div>
      </aside>
    </div>
  );
}

function ManualPanel() {
  const [state, action] = useActionState(upsertPriceProductAction, emptyState);
  const codeErrors = errorsFor(state, "code");
  const groupErrors = errorsFor(state, "group");
  const nameErrors = errorsFor(state, "name");
  const unitErrors = errorsFor(state, "unit");
  const priceErrors = errorsFor(state, "price");
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="grid-paper flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-sm"><Plus aria-hidden="true" className="size-4" /></span>
        <div><p className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Carga manual</p><h2 className="text-sm font-semibold tracking-tight">Nuevo precio</h2></div>
      </header>
      <form action={action} className="flex flex-col gap-3 bg-gradient-to-b from-primary/[0.025] to-transparent p-4">
        <Field data-invalid={Boolean(codeErrors?.length)}><FieldLabel htmlFor="new-code">Código estable (opcional)</FieldLabel><Input aria-describedby={codeErrors?.length ? "new-code-error" : undefined} aria-invalid={Boolean(codeErrors?.length)} className="h-10 rounded-xl border-input bg-background/80 font-mono text-xs shadow-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-primary/20 motion-reduce:transition-none" id="new-code" name="code" placeholder="Se puede dejar vacío" /><FieldError className="text-xs leading-4" errors={codeErrors} id="new-code-error" /></Field>
        <Field data-invalid={Boolean(groupErrors?.length)}><FieldLabel htmlFor="new-group">Grupo</FieldLabel><Select name="group" required><SelectTrigger aria-describedby={groupErrors?.length ? "new-group-error" : undefined} aria-invalid={Boolean(groupErrors?.length)} className="h-10 rounded-xl border-input bg-background/80 shadow-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-primary/20 motion-reduce:transition-none" id="new-group"><SelectValue placeholder="Elegí un grupo" /></SelectTrigger><SelectContent>{PRICE_GROUPS.map((group) => <SelectItem key={group} value={group}>{labels[group]}</SelectItem>)}</SelectContent></Select><FieldError className="text-xs leading-4" errors={groupErrors} id="new-group-error" /></Field>
        <Field data-invalid={Boolean(nameErrors?.length)}><FieldLabel htmlFor="new-name">Nombre</FieldLabel><Input aria-describedby={nameErrors?.length ? "new-name-error" : undefined} aria-invalid={Boolean(nameErrors?.length)} className="h-10 rounded-xl border-input bg-background/80 shadow-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-primary/20 motion-reduce:transition-none" id="new-name" name="name" placeholder="Producto o servicio" required /><FieldError className="text-xs leading-4" errors={nameErrors} id="new-name-error" /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field data-invalid={Boolean(unitErrors?.length)}><FieldLabel htmlFor="new-unit">Unidad</FieldLabel><Select defaultValue="unidad" name="unit"><SelectTrigger aria-describedby={unitErrors?.length ? "new-unit-error" : undefined} aria-invalid={Boolean(unitErrors?.length)} className="h-10 rounded-xl border-input bg-background/80 shadow-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-primary/20 motion-reduce:transition-none" id="new-unit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unidad">Unidad</SelectItem><SelectItem value="metro_lineal">Metro lineal</SelectItem></SelectContent></Select><FieldError className="text-xs leading-4" errors={unitErrors} id="new-unit-error" /></Field><Field data-invalid={Boolean(priceErrors?.length)}><FieldLabel htmlFor="new-price">Precio ARS</FieldLabel><Input aria-describedby={priceErrors?.length ? "new-price-error" : undefined} aria-invalid={Boolean(priceErrors?.length)} className="h-10 rounded-xl border-input bg-background/80 font-mono tabular-nums shadow-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-primary/20 motion-reduce:transition-none" id="new-price" inputMode="decimal" name="price" placeholder="0,00" required /><FieldError className="text-xs leading-4" errors={priceErrors} id="new-price-error" /></Field></div>
        <input name="active" type="hidden" value="true" />
        <SubmitButton className={cn("mt-1 w-full", buttonMotion)} pendingLabel="Guardando"><Plus aria-hidden="true" data-icon="inline-start" />Agregar precio</SubmitButton>
        <Feedback state={state} />
      </form>
    </section>
  );
}

export function PricingManager({ data }: { data: PriceList }) {
  const [tab, setTab] = useState<"list" | "quote">("list");
  const [deleteState, deleteAction] = useActionState(deletePriceProductAction, emptyState);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [quoteLineCount, setQuoteLineCount] = useState(0);
  useMutationToast(deleteState);
  const products = data.products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleProducts = products.slice((currentPage - 1) * PRODUCT_PAGE_SIZE, currentPage * PRODUCT_PAGE_SIZE);
  const activeCount = data.products.filter((product) => product.active).length;
  const listTab = "commercial-list-tab"; const quoteTab = "commercial-quote-tab";
  const selectTab = (next: "list" | "quote") => {
    setTab(next);
    window.requestAnimationFrame(() => document.getElementById(next === "list" ? listTab : quoteTab)?.focus());
  };
  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const handleTabKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab(tab === "list" ? "quote" : "list");
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground"><Calculator aria-hidden="true" className="size-3" />Comercial</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-display">Cotizador</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Administrá la lista de precios y armá cotizaciones sin guardar historial.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{data.products.length}</span> productos</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{quoteLineCount}</span> en cotización</span>
        </div>
      </header>

       <div aria-label="Secciones comerciales" className="mt-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface-muted/65 p-1" onKeyDown={handleTabKeyDown} role="tablist">
         <Button aria-controls="commercial-list-panel" aria-selected={tab === "list"} className={cn("h-9 shrink-0 rounded-lg px-3 text-xs", buttonMotion, tab === "list" ? "border border-border bg-card font-medium shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")} id={listTab} onClick={() => selectTab("list")} role="tab" tabIndex={tab === "list" ? 0 : -1} type="button" variant="ghost"><Tags aria-hidden="true" className="text-primary" data-icon="inline-start" />Lista de precios <Badge className="h-5 min-w-5 rounded-full px-1.5 font-mono text-[10px]" variant="secondary">{activeCount}</Badge></Button>
         <Button aria-controls="commercial-quote-panel" aria-selected={tab === "quote"} className={cn("h-9 shrink-0 rounded-lg px-3 text-xs", buttonMotion, tab === "quote" ? "border border-border bg-card font-medium shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")} id={quoteTab} onClick={() => selectTab("quote")} role="tab" tabIndex={tab === "quote" ? 0 : -1} type="button" variant="ghost"><Calculator aria-hidden="true" className="text-primary" data-icon="inline-start" />Armar cotización <Badge className="h-5 min-w-5 rounded-full px-1.5 font-mono text-[10px]" variant="secondary">{quoteLineCount}</Badge></Button>
       </div>

       <div className="mt-6">
         {tab === "list" ? (
           <div aria-labelledby={listTab} id="commercial-list-panel" role="tabpanel" tabIndex={0}>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
               <section className="flex min-h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                 <header className="grid-paper flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
                   <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Tags aria-hidden="true" className="size-[18px]" /></span>
                   <div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Lista vigente</p><h2 className="text-sm font-semibold tracking-tight">Productos y precios</h2></div>
                    <Field className="ml-auto w-full sm:w-56"><FieldLabel className="sr-only" htmlFor="price-search">Buscar por nombre</FieldLabel><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 rounded-xl border-input bg-card pl-9 shadow-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-primary/60 focus-visible:bg-card focus-visible:ring-primary/20 motion-reduce:transition-none" id="price-search" onChange={(event) => updateSearch(event.target.value)} placeholder="Buscar producto" type="search" value={search} /></div></Field>
                 </header>
                  <ul className="divide-y divide-border">{visibleProducts.map((product) => <ProductRow deleteAction={deleteAction} key={product.id} product={product} />)}</ul>
                 {!products.length ? <div className="grid min-h-48 place-items-center gap-2 px-6 py-14 text-center"><FileSpreadsheet aria-hidden="true" className="size-6 text-muted-foreground/60" /><p className="text-sm text-muted-foreground">No hay precios que coincidan con la búsqueda.</p></div> : null}
                 {products.length > PRODUCT_PAGE_SIZE ? (
                   <nav aria-label="Paginación de productos" className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 sm:px-6">
                     <p aria-live="polite" className="text-xs text-muted-foreground">Mostrando <span className="font-mono tabular-nums text-foreground">{(currentPage - 1) * PRODUCT_PAGE_SIZE + 1}-{Math.min(currentPage * PRODUCT_PAGE_SIZE, products.length)}</span> de <span className="font-mono tabular-nums text-foreground">{products.length}</span></p>
                     <div className="flex gap-2">
                       <Button aria-label="Productos anteriores" className={buttonMotion} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} size="sm" variant="outline"><ChevronLeft aria-hidden="true" data-icon="inline-start" /><span className="sr-only sm:not-sr-only">Anterior</span></Button>
                       <span aria-current="page" className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border bg-surface-muted px-2 font-mono text-xs tabular-nums">{currentPage}/{totalPages}</span>
                       <Button aria-label="Productos siguientes" className={buttonMotion} disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} size="sm" variant="outline"><span className="sr-only sm:not-sr-only">Siguiente</span><ChevronRight aria-hidden="true" data-icon="inline-end" /></Button>
                     </div>
                   </nav>
                 ) : null}
               </section>
               <div className="flex min-w-0 flex-col gap-6"><ImportPanel current={data.products} /><ManualPanel /></div>
             </div>
           </div>
         ) : (
           <div aria-labelledby={quoteTab} id="commercial-quote-panel" role="tabpanel" tabIndex={0}><QuoteBuilder onLinesChange={setQuoteLineCount} products={data.products} /></div>
         )}
       </div>
    </div>
  );
}
