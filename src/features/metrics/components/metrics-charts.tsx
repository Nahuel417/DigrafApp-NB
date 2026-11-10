"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { PackageOpen } from "lucide-react";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatArs } from "@/lib/money/decimal";

import type { MetricsCashDaily, MetricsProduct, MetricsSalesDaily } from "../contract";

const salesConfig: ChartConfig = {
  loose_garments: { label: "Prendas sueltas", color: "var(--primary)" },
  common_sets: { label: "Conjuntos comunes", color: "var(--success-foreground)" },
  premium_sets: { label: "Conjuntos premium", color: "var(--warning-foreground)" },
};

const cashConfig: ChartConfig = {
  income_coordinate: { label: "Ingresos", color: "var(--primary)" },
  expense_coordinate: { label: "Egresos", color: "var(--warning-foreground)" },
};

const productConfig: ChartConfig = {
  quantity: { label: "Unidades", color: "var(--primary)" },
};

const setsConfig: ChartConfig = {
  common: { label: "Conjuntos comunes", color: "var(--success-foreground)" },
  premium: { label: "Conjuntos premium", color: "var(--warning-foreground)" },
};

const reasonsConfig: ChartConfig = {
  count: { label: "Devoluciones", color: "var(--primary)" },
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function formatDateTick(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function formatCount(value: number) {
  return value.toLocaleString("es-AR");
}

function MetricsChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex min-h-[210px] flex-col items-center justify-center gap-3 rounded-lg bg-muted/25 px-5 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-border/70 bg-background">
        <PackageOpen aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

function formatCashTooltip(payload: unknown, dataKey: unknown) {
  if (typeof payload !== "object" || payload === null) return "Importe no disponible";
  const key = dataKey === "income_coordinate" ? "income" : "expense";
  const amount = (payload as Record<string, unknown>)[key];
  return typeof amount === "string" ? formatArs(amount) : "Importe no disponible";
}

export function MetricsCashChart({ series }: { series: MetricsCashDaily[] }) {
  const data = series.map((day) => ({
    ...day,
    income_coordinate: Number(day.income),
    expense_coordinate: Number(day.expense),
  }));

  return (
    <section aria-labelledby="metrics-cash-chart-heading" className="mt-5 min-w-0 border-t border-border/60 pt-5">
      <h3 className="mb-2 text-sm font-medium" id="metrics-cash-chart-heading">Ingresos y egresos diarios</h3>
      <p className="mb-2 text-xs text-muted-foreground">Importes en ARS; el saldo neto no representa la ganancia.</p>
      {data.length ? (
        <>
          <ChartContainer
            aria-labelledby="metrics-cash-chart-heading"
            className="aspect-auto min-h-[250px] min-w-0 w-full"
            config={cashConfig}
            initialDimension={{ width: 480, height: 250 }}
            role="group"
            style={{ height: 250 }}
          >
            <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="date" tickFormatter={formatDateTick} tickLine={false} />
              <YAxis axisLine={false} tickFormatter={(value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 0 })} tickLine={false} width={72} />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(_value, _name, item) => formatCashTooltip(item.payload, item.dataKey)} />}
                cursor={false}
              />
              <Area dataKey="income_coordinate" fill="var(--color-income_coordinate)" fillOpacity={0.14} isAnimationActive={false} stroke="var(--color-income_coordinate)" strokeWidth={2} type="monotone" />
              <Area dataKey="expense_coordinate" fill="var(--color-expense_coordinate)" fillOpacity={0.14} isAnimationActive={false} stroke="var(--color-expense_coordinate)" strokeWidth={2} type="monotone" />
            </AreaChart>
          </ChartContainer>
          <ul aria-label="Series de caja" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />Ingresos</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-warning-foreground" />Egresos</li>
          </ul>
          <Table aria-label="Detalle diario de ingresos y egresos" className="sr-only">
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Ingresos</TableHead><TableHead>Egresos</TableHead></TableRow></TableHeader>
            <TableBody>
              {series.map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{day.date}</TableCell><TableCell>{formatArs(day.income)}</TableCell><TableCell>{formatArs(day.expense)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No hay movimientos de caja en el período.</p>}
    </section>
  );
}

export function MetricsReasonChart({ reasons }: { reasons: Array<{ code: string; label: string; count: number }> }) {
  const maxReasonCount = reasons.reduce((max, reason) => Math.max(max, reason.count), 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {maxReasonCount > 0 ? (
        <section aria-labelledby="metrics-return-reasons-chart-heading" className="min-w-0">
          <h3 className="sr-only" id="metrics-return-reasons-chart-heading">Motivos de devolución</h3>
          <ChartContainer
            aria-labelledby="metrics-return-reasons-chart-heading"
            className="aspect-auto min-w-0 w-full"
            config={reasonsConfig}
            initialDimension={{ width: 320, height: Math.max(200, reasons.length * 36 + 48) }}
            role="group"
            style={{ height: Math.max(200, reasons.length * 36 + 48) }}
          >
            <BarChart accessibilityLayer data={reasons} layout="vertical" margin={{ left: 4, right: 16, top: 8, bottom: 24 }}>
              <CartesianGrid horizontal={false} />
              <XAxis allowDecimals={false} axisLine={false} dataKey="count" domain={[0, maxReasonCount || 1]} label={{ value: "Devoluciones", position: "insideBottom", offset: -16 }} tickFormatter={formatCount} tickLine={false} type="number" />
              <YAxis axisLine={false} dataKey="label" interval={0} tickLine={false} type="category" width={140} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${formatCount(Number(value))} devoluciones`} />} cursor={false} />
              <Bar barSize={18} dataKey="count" fill="var(--color-count)" isAnimationActive={false} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartContainer>
        </section>
      ) : <MetricsChartEmpty message="No hay motivos de devolución en el período." />}
      <ul aria-label="Incidencias por motivo" className="sr-only">
        {reasons.map((reason) => (
          <li className="flex items-center justify-between gap-3 py-2.5 text-sm" key={reason.code}>
            <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" /><span>{reason.label}</span></span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatCount(reason.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MetricsSalesChart({ dailySeries }: { dailySeries: MetricsSalesDaily[] }) {
  const salesData = dailySeries.map((day) => ({
    ...day,
    common_sets: day.sets.common,
    premium_sets: day.sets.premium,
  }));

  return (
    <section aria-labelledby="metrics-daily-sales-chart-heading" className="min-w-0">
      <h3 className="mb-2 text-sm font-medium" id="metrics-daily-sales-chart-heading">Ventas diarias por categoría</h3>
      {salesData.length ? (
        <>
          <ChartContainer
            aria-labelledby="metrics-daily-sales-chart-heading"
            className="aspect-auto min-h-[250px] min-w-0 w-full"
            config={salesConfig}
            initialDimension={{ width: 480, height: 250 }}
            role="group"
            style={{ height: 250 }}
          >
            <LineChart accessibilityLayer data={salesData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="date" tickFormatter={formatDateTick} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickFormatter={formatCount} tickLine={false} width={52} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${formatCount(Number(value))} unidades`} />} cursor={false} />
              <Line dataKey="loose_garments" dot={false} isAnimationActive={false} stroke="var(--color-loose_garments)" strokeWidth={2} type="monotone" />
              <Line dataKey="common_sets" dot={false} isAnimationActive={false} stroke="var(--color-common_sets)" strokeWidth={2} type="monotone" />
              <Line dataKey="premium_sets" dot={false} isAnimationActive={false} stroke="var(--color-premium_sets)" strokeWidth={2} type="monotone" />
            </LineChart>
          </ChartContainer>
          <ul aria-label="Categorías de ventas" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />Prendas sueltas</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-success-foreground" />Conjuntos comunes</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-warning-foreground" />Conjuntos premium</li>
          </ul>
          <Table aria-label="Detalle diario de ventas" className="sr-only">
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Prendas sueltas</TableHead><TableHead>Conjuntos comunes</TableHead><TableHead>Conjuntos premium</TableHead></TableRow></TableHeader>
            <TableBody>
              {dailySeries.map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{day.date}</TableCell><TableCell>{formatCount(day.loose_garments)}</TableCell>
                  <TableCell>{formatCount(day.sets.common)}</TableCell><TableCell>{formatCount(day.sets.premium)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No hay ventas en el período.</p>}
    </section>
  );
}

export function MetricsSetsChart({ sets }: { sets: { common: number; premium: number } }) {
  const totalSets = sets.common + sets.premium;
  const setData = [
    { type: "common", name: "Conjuntos comunes", quantity: sets.common },
    { type: "premium", name: "Conjuntos premium", quantity: sets.premium },
  ].filter((item) => item.quantity > 0);

  return (
    <section aria-labelledby="metrics-sets-chart-heading" className="min-w-0">
      <h3 className="sr-only" id="metrics-sets-chart-heading">Proporción de conjuntos vendidos</h3>
      {totalSets > 0 ? (
        <>
          <ChartContainer
            aria-labelledby="metrics-sets-chart-heading"
            className="aspect-auto min-h-[210px] min-w-0 w-full"
            config={setsConfig}
            initialDimension={{ width: 320, height: 210 }}
            role="group"
            style={{ height: 210 }}
          >
            <PieChart accessibilityLayer>
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${formatCount(Number(value))} unidades`} />} cursor={false} />
              <Pie data={setData} dataKey="quantity" innerRadius={62} isAnimationActive={false} nameKey="type" outerRadius={86} paddingAngle={3} stroke="var(--card)" strokeWidth={3}>
                {setData.map((item) => <Cell fill={item.type === "common" ? "var(--color-common)" : "var(--color-premium)"} key={item.type} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <p className="sr-only">Total: <strong>{formatCount(totalSets)}</strong> conjuntos</p>
          <ul aria-label="Conjuntos vendidos por tipo" className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-xs">
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-success-foreground" />Comunes:</span>
              <span className="font-mono tabular-nums text-muted-foreground">{formatCount(sets.common)} ({new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, style: "percent" }).format(sets.common / totalSets)})</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-warning-foreground" />Premium:</span>
              <span className="font-mono tabular-nums text-muted-foreground">{formatCount(sets.premium)} ({new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, style: "percent" }).format(sets.premium / totalSets)})</span>
            </li>
          </ul>
        </>
      ) : <MetricsChartEmpty message="No hay conjuntos vendidos en el período." />}
    </section>
  );
}

export function MetricsProductChart({ products }: { products: MetricsProduct[] }) {
  const maxProductQuantity = products.reduce((max, product) => Math.max(max, product.quantity), 0);

  if (!products.length) return null;
  if (maxProductQuantity === 0) return <MetricsChartEmpty message="No hay unidades vendidas para estos productos en el período." />;

  return (
    <section aria-labelledby="metrics-product-chart-heading" className="min-w-0">
      <h3 className="sr-only" id="metrics-product-chart-heading">Unidades vendidas por producto</h3>
      <ChartContainer
        aria-labelledby="metrics-product-chart-heading"
        className="aspect-auto min-w-0 w-full"
        config={productConfig}
        initialDimension={{ width: 320, height: Math.max(220, products.length * 36 + 48) }}
        role="group"
        style={{ height: Math.max(220, products.length * 36 + 48) }}
      >
        <BarChart accessibilityLayer data={products} layout="vertical" margin={{ left: 4, right: 16, top: 8, bottom: 24 }}>
          <CartesianGrid horizontal={false} />
          <XAxis allowDecimals={false} axisLine={false} dataKey="quantity" domain={[0, maxProductQuantity || 1]} label={{ value: "Unidades", position: "insideBottom", offset: -16 }} tickFormatter={formatCount} tickLine={false} type="number" />
          <YAxis axisLine={false} dataKey="name" interval={0} tickLine={false} type="category" width={140} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${formatCount(Number(value))} unidades`} />} cursor={false} />
          <Bar barSize={18} dataKey="quantity" fill="var(--color-quantity)" isAnimationActive={false} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

export function MetricsCharts({ dailySeries, products, sets }: {
  dailySeries: MetricsSalesDaily[];
  products: MetricsProduct[];
  sets: { common: number; premium: number };
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <MetricsSalesChart dailySeries={dailySeries} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <MetricsSetsChart sets={sets} />
        <MetricsProductChart products={products} />
      </div>
    </div>
  );
}
