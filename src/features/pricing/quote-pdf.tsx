import "server-only";
/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image has no alt prop. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import { calculateQuote, decimalToCents, formatQuoteCents, type QuoteLineInput } from "./calculation";

const styles = StyleSheet.create({
  page: { color: "#1f2937", fontFamily: "Helvetica", fontSize: 10, padding: 42 },
  header: { borderBottomColor: "#d1d5db", borderBottomWidth: 1, marginBottom: 22, paddingBottom: 12 },
  logo: { height: 28, marginBottom: 8, objectFit: "contain", objectPosition: "left" },
  title: { color: "#111827", fontSize: 22, fontWeight: "bold" },
  meta: { color: "#6b7280", fontSize: 9, marginTop: 5 },
  section: { marginBottom: 18 }, label: { color: "#6b7280", fontSize: 8, marginBottom: 3 }, value: { color: "#111827", fontSize: 10 },
  row: { borderBottomColor: "#e5e7eb", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 8, paddingTop: 8 },
  total: { borderTopColor: "#9ca3af", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 12 },
  totalValue: { color: "#111827", fontSize: 18, fontWeight: "bold" }, footer: { bottom: 24, color: "#6b7280", fontSize: 8, left: 42, position: "absolute", right: 42 },
});

export type QuotePdfData = { lines: QuoteLineInput[]; discount: string; client: string; team: string; phone: string; dni: string; notes: string; validity: number; generatedAt: string };

export function QuoteDocument({ data }: { data: QuotePdfData }) {
  const result = calculateQuote(data.lines, data.discount);
  const logo = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "brand", "digraf-logo.png")).toString("base64")}`;
  return <Document author="Digraf" subject="Cotización" title="Cotización Digraf"><Page size="A4" style={styles.page}><View style={styles.header}><Image src={logo} style={styles.logo} /><Text style={styles.title}>Cotización</Text><Text style={styles.meta}>Generada el {data.generatedAt} · Válida por {data.validity} días</Text></View><View style={styles.section}><Text style={styles.label}>Cliente</Text><Text style={styles.value}>{data.client || "Sin completar"}</Text>{data.team ? <><Text style={styles.label}>Equipo / Institución</Text><Text style={styles.value}>{data.team}</Text></> : null}{data.phone ? <><Text style={styles.label}>Teléfono</Text><Text style={styles.value}>{data.phone}</Text></> : null}{data.dni ? <><Text style={styles.label}>DNI</Text><Text style={styles.value}>{data.dni}</Text></> : null}</View><View style={styles.section}><Text style={styles.label}>Detalle de productos</Text>{result.lines.map((line, index) => <View key={`${line.name}-${index}`} style={styles.row} wrap={false}><Text>{line.name} · {line.quantity} {line.unit === "metro_lineal" ? "metros lineales" : "unidades"} · Precio unitario $ {formatQuoteCents(decimalToCents(line.unitPrice))} · Subtotal $ {formatQuoteCents(line.lineTotalCents)}</Text></View>)}</View>{data.notes ? <View style={styles.section}><Text style={styles.label}>Notas</Text><Text style={styles.value}>{data.notes}</Text></View> : null}<View style={styles.total}><Text>Subtotal</Text><Text>$ {formatQuoteCents(result.subtotalCents)}</Text></View><View style={styles.row}><Text>Descuento ({data.discount}%)</Text><Text>− $ {formatQuoteCents(result.discountCents)}</Text></View><View style={styles.total}><Text style={{ fontWeight: "bold" }}>Total</Text><Text style={styles.totalValue}>$ {formatQuoteCents(result.totalCents)}</Text></View><Text style={styles.footer}>Cotización informativa. Precios sujetos a confirmación al momento del pedido.</Text></Page></Document>;
}

export function renderQuotePdf(data: QuotePdfData) { return renderToBuffer(<QuoteDocument data={data} /> as Parameters<typeof renderToBuffer>[0]); }
