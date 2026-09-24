import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  Document,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { calculateQuote, decimalToCents } from "./calculation";
import type { QuoteLineInput } from "./calculation";

export type QuotePdfInput = {
  lines: QuoteLineInput[];
  discount: string;
  client: string;
  team: string;
  phone: string;
  dni: string;
  notes: string;
  validity: number;
  generatedAt: string;
};

const MARK = readFileSync(path.join(process.cwd(), "public", "brand", "digraf-favicon.png"));

const colors = {
  ink: "#20261d",
  muted: "#666c62",
  green: "#476f33",
  forest: "#193414",
  grid: "#31502a",
  paper: "#fbfaf7",
  sage: "#f0f2e8",
  rule: "#d9dbd1",
  white: "#ffffff",
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: "Helvetica",
    fontSize: 8,
    paddingBottom: 58,
  },
  hero: { height: 222, flexDirection: "row" },
  heroMain: { width: "65%", paddingTop: 34, paddingLeft: 37, paddingRight: 28 },
  brandLockup: { flexDirection: "row", alignItems: "center", marginBottom: 21 },
  brandMarkFrame: { width: 64, height: 64, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest, borderRadius: 12, marginRight: 14 },
  brandMark: { width: 50, height: 50, objectFit: "contain" },
  brandName: { fontFamily: "Helvetica-Bold", fontSize: 15 },
  brandCaption: { color: colors.muted, fontSize: 7, marginTop: 4 },
  kicker: {
    color: colors.green,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    letterSpacing: 1.3,
    marginBottom: 9,
  },
  title: { fontFamily: "Helvetica-Bold", fontSize: 29, letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 8.5, lineHeight: 1.55, marginTop: 11, width: 245 },
  heroAside: {
    width: "35%",
    backgroundColor: colors.forest,
    paddingTop: 54,
    paddingLeft: 30,
    paddingRight: 25,
    overflow: "hidden",
  },
  gridLineVertical: { position: "absolute", top: 0, bottom: 0, width: 0.5, backgroundColor: colors.grid },
  gridLineHorizontal: { position: "absolute", left: 0, right: 0, height: 0.5, backgroundColor: colors.grid },
  shirtIcon: { width: 38, height: 38, marginBottom: 19 },
  asideTitle: { color: colors.white, fontFamily: "Helvetica-Bold", fontSize: 12, lineHeight: 1.35, width: 145 },
  asideRule: { width: 18, height: 1, backgroundColor: "#78906d", marginTop: 20, marginBottom: 8 },
  asideCaption: { color: "#d7e0d2", fontSize: 6.5 },
  main: { paddingHorizontal: 37 },
  clientRow: {
    minHeight: 116,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  clientBlock: { width: "67%", paddingRight: 24 },
  label: {
    color: colors.green,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    letterSpacing: 1.1,
    marginBottom: 7,
  },
  clientName: { fontFamily: "Helvetica-Bold", fontSize: 15.5, marginBottom: 11 },
  clientDetails: { flexDirection: "row", flexWrap: "wrap" },
  clientDetail: { minWidth: 88, maxWidth: 132, marginRight: 12, marginBottom: 4 },
  clientDetailLabel: { color: colors.muted, fontFamily: "Helvetica-Bold", fontSize: 5.5, letterSpacing: 0.65, marginBottom: 3 },
  clientDetailValue: { color: colors.ink, fontSize: 7.8 },
  validity: {
    width: "33%",
    minHeight: 66,
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: colors.sage,
    borderRadius: 7,
    justifyContent: "center",
  },
  validityValue: { color: colors.forest, fontFamily: "Helvetica-Bold", fontSize: 12 },
  issuedAt: { color: colors.muted, fontSize: 7, marginTop: 5 },
  detailHeader: { marginTop: 29, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 12.5 },
  quantityBadge: {
    backgroundColor: colors.sage,
    color: colors.green,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
  },
  table: { width: "100%" },
  tableHeader: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.sage,
    borderRadius: 6,
  },
  tableHeaderText: { color: colors.muted, fontFamily: "Helvetica-Bold", fontSize: 5.8 },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  cell: { paddingHorizontal: 8 },
  productCell: { width: "52%" },
  quantityCell: { width: "12%", textAlign: "center" },
  priceCell: { width: "18%", textAlign: "right" },
  productName: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 4 },
  unit: { color: colors.muted, fontSize: 6.2 },
  subtotal: { color: colors.forest, fontFamily: "Helvetica-Bold" },
  closing: { flexDirection: "row", marginTop: 29, minHeight: 118 },
  notes: {
    width: "57%",
    paddingTop: 13,
    paddingLeft: 12,
    paddingRight: 28,
    borderLeftWidth: 2,
    borderLeftColor: colors.green,
  },
  notesText: { color: colors.muted, fontSize: 7.5, lineHeight: 1.55 },
  totalsCard: { width: "43%", backgroundColor: colors.sage, borderRadius: 8, padding: 15 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  totalsLabel: { color: colors.muted, fontSize: 7.5 },
  totalsValue: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  totalRule: { height: 1, backgroundColor: colors.rule, marginBottom: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  totalValue: { color: colors.forest, fontFamily: "Helvetica-Bold", fontSize: 18 },
  footer: {
    position: "absolute",
    left: 37,
    right: 37,
    bottom: 22,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerTitle: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  footerCaption: { color: colors.muted, fontSize: 5.8, marginTop: 5 },
  footerRight: { flexDirection: "row", alignItems: "center" },
  pageNumber: { color: colors.muted, fontSize: 6, marginRight: 10 },
  footerMark: { width: 27, height: 27, objectFit: "contain" },
});

function Grid() {
  return (
    <>
      {[17, 34, 51, 68, 85].map((left) => <View key={`v-${left}`} style={[styles.gridLineVertical, { left: `${left}%` }]} />)}
      {[18, 36, 54, 72, 90].map((top) => <View key={`h-${top}`} style={[styles.gridLineHorizontal, { top: `${top}%` }]} />)}
    </>
  );
}

function QuoteHero() {
  return (
    <View style={styles.hero}>
      <View style={styles.heroMain}>
        <View style={styles.brandLockup}>
          <View style={styles.brandMarkFrame}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={MARK} style={styles.brandMark} />
          </View>
          <View>
            <Text style={styles.brandName}>Digraf</Text>
            <Text style={styles.brandCaption}>Impresión textil</Text>
          </View>
        </View>
        <Text style={styles.kicker}>PROPUESTA COMERCIAL</Text>
        <Text style={styles.title}>Cotización</Text>
        <Text style={styles.subtitle}>Una propuesta preparada especialmente para tu próximo pedido.</Text>
      </View>
      <View style={styles.heroAside}>
        <Grid />
        <Svg style={styles.shirtIcon} viewBox="0 0 24 24">
          <Path
            d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46A2 2 0 0 0 2.28 5.2L1.7 9.09a1 1 0 0 0 .84 1.14l2.74.46V21a1 1 0 0 0 1 1h11.44a1 1 0 0 0 1-1V10.69l2.74-.46a1 1 0 0 0 .84-1.14l-.58-3.89a2 2 0 0 0-1.34-1.74Z"
            fill="none"
            stroke="#f6f7f1"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
          />
        </Svg>
        <Text style={styles.asideTitle}>Diseño, producción y terminación textil en un solo lugar.</Text>
        <View style={styles.asideRule} />
        <Text style={styles.asideCaption}>Calidad en cada detalle</Text>
      </View>
    </View>
  );
}

function QuoteFooter() {
  return (
    <View fixed style={styles.footer}>
      <View>
        <Text style={styles.footerTitle}>Gracias por elegir Digraf</Text>
        <Text style={styles.footerCaption}>Esta cotización es informativa y no constituye una factura.</Text>
      </View>
      <View style={styles.footerRight}>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={MARK} style={styles.footerMark} />
      </View>
    </View>
  );
}

function formatMoney(cents: bigint) {
  const whole = (cents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `$ ${whole},${fraction}`;
}

function QuoteDocument({ input }: { input: QuotePdfInput }) {
  const quote = calculateQuote(input.lines, input.discount);
  const units = quote.lines.reduce((total, line) => total + Number(line.quantity.replace(",", ".")), 0);

  return (
    <Document title={`Cotización Digraf - ${input.client || "Cliente"}`} author="Digraf">
      <Page size="A4" style={styles.page}>
        <QuoteHero />

        <View style={styles.main}>
          <View style={styles.clientRow}>
            <View style={styles.clientBlock}>
              <Text style={styles.label}>PREPARADO PARA</Text>
              <Text style={styles.clientName}>{input.client || "Cliente no informado"}</Text>
              <View style={styles.clientDetails}>
                {input.team ? (
                  <View style={styles.clientDetail}>
                    <Text style={styles.clientDetailLabel}>EQUIPO / INSTITUCIÓN</Text>
                    <Text style={styles.clientDetailValue}>{input.team}</Text>
                  </View>
                ) : null}
                {input.phone ? (
                  <View style={styles.clientDetail}>
                    <Text style={styles.clientDetailLabel}>TELÉFONO</Text>
                    <Text style={styles.clientDetailValue}>{input.phone}</Text>
                  </View>
                ) : null}
                {input.dni ? (
                  <View style={styles.clientDetail}>
                    <Text style={styles.clientDetailLabel}>DNI</Text>
                    <Text style={styles.clientDetailValue}>{input.dni}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.validity}>
              <Text style={styles.label}>VALIDEZ DE LA PROPUESTA</Text>
              <Text style={styles.validityValue}>{input.validity} días</Text>
              <Text style={styles.issuedAt}>Emitida el {input.generatedAt}</Text>
            </View>
          </View>

          <View style={styles.detailHeader}>
            <Text style={styles.sectionTitle}>Detalle del pedido</Text>
            <Text style={styles.quantityBadge}>{units.toLocaleString("es-AR", { maximumFractionDigits: 2 })} unidades</Text>
          </View>

          <View style={styles.table}>
            <View fixed style={styles.tableHeader}>
              <Text style={[styles.cell, styles.productCell, styles.tableHeaderText]}>PRODUCTO</Text>
              <Text style={[styles.cell, styles.quantityCell, styles.tableHeaderText]}>CANT.</Text>
              <Text style={[styles.cell, styles.priceCell, styles.tableHeaderText]}>PRECIO UNITARIO</Text>
              <Text style={[styles.cell, styles.priceCell, styles.tableHeaderText]}>SUBTOTAL</Text>
            </View>
            {quote.lines.map((line, index) => (
              <View key={`${line.name}-${index}`} wrap={false} style={styles.row}>
                <View style={[styles.cell, styles.productCell]}>
                  <Text style={styles.productName}>{line.name}</Text>
                  <Text style={styles.unit}>Unidad de medida: {line.unit === "metro_lineal" ? "metro lineal" : "unidad"}</Text>
                </View>
                <Text style={[styles.cell, styles.quantityCell]}>{line.quantity}</Text>
                <Text style={[styles.cell, styles.priceCell]}>{formatMoney(decimalToCents(line.unitPrice))}</Text>
                <Text style={[styles.cell, styles.priceCell, styles.subtotal]}>{formatMoney(line.lineTotalCents)}</Text>
              </View>
            ))}
          </View>

          <View wrap={false} style={styles.closing}>
            <View style={styles.notes}>
              <Text style={styles.label}>NOTAS Y CONDICIONES</Text>
              <Text style={styles.notesText}>{input.notes || "Precios expresados en pesos argentinos. La producción comienza una vez confirmado el pedido."}</Text>
            </View>
            <View style={styles.totalsCard}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotal</Text>
                <Text style={styles.totalsValue}>{formatMoney(quote.subtotalCents)}</Text>
              </View>
              {quote.discountCents > 0 ? (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Descuento ({input.discount}%)</Text>
                  <Text style={styles.totalsValue}>- {formatMoney(quote.discountCents)}</Text>
                </View>
              ) : null}
              <View style={styles.totalRule} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalValue}>{formatMoney(quote.totalCents)}</Text>
              </View>
            </View>
          </View>
        </View>

        <QuoteFooter />
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(input: QuotePdfInput) {
  return renderToBuffer(<QuoteDocument input={input} />);
}
