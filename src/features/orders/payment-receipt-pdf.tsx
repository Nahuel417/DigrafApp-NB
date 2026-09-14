import { readFileSync } from "node:fs";
import path from "node:path";

import { Document, Image, Page, Path, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { buildOrderSpecificationSections } from "./components/order-specifications";
import { formatArsFromNumber, formatDateTime, formatOrderNumber, orderTypeLabel, selectionLabel } from "./detail-format";
import type { OrderDetailData } from "./detail-queries";
import type { ActiveOrderPayment } from "./payment-receipt";

export const PAYMENT_RECEIPT_TITLE = "Comprobante de pago";
export const PAYMENT_RECEIPT_DISCLAIMER = "Constancia interna de cobro. No es una factura fiscal.";

export type PaymentReceiptData = OrderDetailData & {
  payment: ActiveOrderPayment;
};

const MARK = readFileSync(path.join(process.cwd(), "public", "brand", "digraf-mark.png"));

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
  page: { backgroundColor: colors.paper, color: colors.ink, fontFamily: "Helvetica", fontSize: 8, paddingBottom: 58 },
  hero: { height: 222, flexDirection: "row" },
  heroMain: { width: "65%", paddingTop: 34, paddingLeft: 37, paddingRight: 28 },
  brandLockup: { flexDirection: "row", alignItems: "center", marginBottom: 29 },
  brandMark: { width: 34, height: 34, objectFit: "contain", marginRight: 10 },
  brandName: { fontFamily: "Helvetica-Bold", fontSize: 12.5 },
  brandCaption: { color: colors.muted, fontSize: 6.2, marginTop: 3 },
  kicker: { color: colors.green, fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.3, marginBottom: 9 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 27, letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 8.5, lineHeight: 1.55, marginTop: 11, width: 260 },
  heroAside: { width: "35%", backgroundColor: colors.forest, paddingTop: 49, paddingLeft: 30, paddingRight: 25, overflow: "hidden" },
  gridLineVertical: { position: "absolute", top: 0, bottom: 0, width: 0.5, backgroundColor: colors.grid },
  gridLineHorizontal: { position: "absolute", left: 0, right: 0, height: 0.5, backgroundColor: colors.grid },
  paidIcon: { width: 38, height: 38, marginBottom: 16 },
  asideLabel: { color: "#d7e0d2", fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1, marginBottom: 7 },
  asideAmount: { color: colors.white, fontFamily: "Helvetica-Bold", fontSize: 20, marginBottom: 8 },
  asideTitle: { color: colors.white, fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  main: { paddingHorizontal: 37 },
  identity: { minHeight: 116, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.rule },
  customer: { width: "58%", paddingRight: 24 },
  label: { color: colors.green, fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.05, marginBottom: 7 },
  customerName: { fontFamily: "Helvetica-Bold", fontSize: 15, marginBottom: 10 },
  details: { flexDirection: "row", flexWrap: "wrap" },
  detail: { minWidth: 90, maxWidth: 125, marginRight: 12, marginBottom: 4 },
  detailLabel: { color: colors.muted, fontFamily: "Helvetica-Bold", fontSize: 5.5, letterSpacing: 0.55, marginBottom: 3 },
  detailValue: { fontSize: 7.8 },
  orderCard: { width: "42%", minHeight: 76, backgroundColor: colors.sage, borderRadius: 7, paddingVertical: 13, paddingHorizontal: 15 },
  orderNumber: { color: colors.forest, fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 8 },
  orderMeta: { color: colors.muted, fontSize: 7, lineHeight: 1.5 },
  sectionHeader: { marginTop: 27, marginBottom: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 12.5 },
  sectionBadge: { backgroundColor: colors.sage, color: colors.green, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 10, fontFamily: "Helvetica-Bold", fontSize: 6.5 },
  line: { borderBottomWidth: 1, borderBottomColor: colors.rule, paddingVertical: 13, paddingHorizontal: 8 },
  lineHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  lineProducts: { flex: 1, paddingRight: 16 },
  lineProductRow: { marginBottom: 8 },
  lineProductRowLast: { marginBottom: 0 },
  lineType: { color: colors.green, fontFamily: "Helvetica-Bold", fontSize: 5.8, letterSpacing: 0.7, marginBottom: 4 },
  lineProduct: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  lineQuantity: { backgroundColor: colors.sage, borderRadius: 8, color: colors.forest, fontFamily: "Helvetica-Bold", fontSize: 7, paddingVertical: 4, paddingHorizontal: 8 },
  specGrid: { flexDirection: "row", flexWrap: "wrap" },
  specRow: { width: "50%", flexDirection: "row", paddingRight: 16, marginBottom: 5 },
  specLabel: { color: colors.muted, fontSize: 6.8, width: "42%" },
  specValue: { color: colors.ink, fontFamily: "Helvetica-Bold", fontSize: 6.8, width: "58%" },
  empty: { color: colors.muted, backgroundColor: colors.sage, borderRadius: 7, padding: 14 },
  description: { marginTop: 22, paddingLeft: 12, paddingVertical: 10, borderLeftWidth: 2, borderLeftColor: colors.green },
  descriptionText: { color: colors.muted, fontSize: 7.5, lineHeight: 1.5 },
  paymentSummary: { marginTop: 28, flexDirection: "row", justifyContent: "space-between", alignItems: "stretch" },
  confirmation: { width: "55%", paddingTop: 12, paddingRight: 22 },
  confirmationDate: { color: colors.ink, fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  totalCard: { width: "45%", backgroundColor: colors.sage, borderRadius: 8, padding: 16 },
  totalLabel: { color: colors.muted, fontSize: 7.5, marginBottom: 9 },
  totalValue: { color: colors.forest, fontFamily: "Helvetica-Bold", fontSize: 20 },
  footer: { position: "absolute", left: 37, right: 37, bottom: 22, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.rule, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerTitle: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  footerCaption: { color: colors.muted, fontSize: 5.8, marginTop: 5 },
  footerRight: { flexDirection: "row", alignItems: "center" },
  pageNumber: { color: colors.muted, fontSize: 6, marginRight: 10 },
  footerMark: { width: 27, height: 27, objectFit: "contain" },
});

function display(value: string | null | undefined) {
  return value?.trim() || "Sin completar";
}

function Grid() {
  return (
    <>
      {[17, 34, 51, 68, 85].map((left) => <View key={`v-${left}`} style={[styles.gridLineVertical, { left: `${left}%` }]} />)}
      {[18, 36, 54, 72, 90].map((top) => <View key={`h-${top}`} style={[styles.gridLineHorizontal, { top: `${top}%` }]} />)}
    </>
  );
}

function ReceiptHero({ amount }: { amount: number }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroMain}>
        <View style={styles.brandLockup}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={MARK} style={styles.brandMark} />
          <View>
            <Text style={styles.brandName}>Digraf</Text>
            <Text style={styles.brandCaption}>Impresión textil</Text>
          </View>
        </View>
        <Text style={styles.kicker}>CONSTANCIA DE COBRO</Text>
        <Text style={styles.title}>{PAYMENT_RECEIPT_TITLE}</Text>
        <Text style={styles.subtitle}>Confirmación del pago registrado para este pedido.</Text>
      </View>
      <View style={styles.heroAside}>
        <Grid />
        <Svg style={styles.paidIcon} viewBox="0 0 24 24">
          <Path d="M20 6 9 17l-5-5" fill="none" stroke="#f6f7f1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </Svg>
        <Text style={styles.asideLabel}>MONTO COBRADO</Text>
        <Text style={styles.asideAmount}>{formatArsFromNumber(amount)}</Text>
        <Text style={styles.asideTitle}>Pago confirmado</Text>
      </View>
    </View>
  );
}

function PaymentReceiptLine({ data, line }: { data: PaymentReceiptData; line: PaymentReceiptData["order"]["lines"][number] }) {
  const sections = buildOrderSpecificationSections(line, data.catalogs, data.selections);
  const base = sections.find((section) => section.title === "Datos del renglón");
  const parts = sections.filter((section) => section.title === "Parte superior" || section.title === "Parte inferior");
  const products = parts.length > 0
    ? parts.map((section) => ({
        name: section.items.find((item) => item.label === "Producto")?.value ?? "Sin completar",
        type: section.title,
      }))
    : [{
        name: base?.items.find((item) => item.label === "Producto")?.value ?? display(line.productName),
        type: base?.items.find((item) => item.label === "Tipo de renglón")?.value ?? "Producto",
      }];

  return (
    <View wrap={false} style={styles.line}>
      <View style={styles.lineHeading}>
        <View style={styles.lineProducts}>
          {products.map((product, index) => (
            <View key={`${product.type}-${product.name}`} style={[styles.lineProductRow, index === products.length - 1 ? styles.lineProductRowLast : {}]}>
              <Text style={styles.lineType}>{product.type.toUpperCase()}</Text>
              <Text style={styles.lineProduct}>{product.name}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.lineQuantity}>{line.quantity} unidades</Text>
      </View>
    </View>
  );
}

function ReceiptFooter() {
  return (
    <View fixed style={styles.footer}>
      <View>
        <Text style={styles.footerTitle}>Gracias por elegir Digraf</Text>
        <Text style={styles.footerCaption}>{PAYMENT_RECEIPT_DISCLAIMER}</Text>
      </View>
      <View style={styles.footerRight}>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={MARK} style={styles.footerMark} />
      </View>
    </View>
  );
}

export function PaymentReceiptDocument({ data }: { data: PaymentReceiptData }) {
  const { order, payment } = data;
  const legacySelections = data.selections.length > 0 && order.lines.length === 0;

  return (
    <Document author="Digraf" subject={PAYMENT_RECEIPT_TITLE} title={`${PAYMENT_RECEIPT_TITLE} ${formatOrderNumber(order.publicNumber)}`}>
      <Page size="A4" style={styles.page} wrap>
        <ReceiptHero amount={payment.amount} />

        <View style={styles.main}>
          <View style={styles.identity}>
            <View style={styles.customer}>
              <Text style={styles.label}>RECIBIDO DE</Text>
              <Text style={styles.customerName}>{display(order.clientName ?? order.customerName)}</Text>
              <View style={styles.details}>
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>EQUIPO / INSTITUCIÓN</Text>
                  <Text style={styles.detailValue}>{display(order.teamName)}</Text>
                </View>
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>TELÉFONO</Text>
                  <Text style={styles.detailValue}>{display(order.phone)}</Text>
                </View>
                {order.dni ? (
                  <View style={styles.detail}>
                    <Text style={styles.detailLabel}>DNI</Text>
                    <Text style={styles.detailValue}>{order.dni}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.orderCard}>
              <Text style={styles.label}>PEDIDO</Text>
              <Text style={styles.orderNumber}>{formatOrderNumber(order.publicNumber)}</Text>
              <Text style={styles.orderMeta}>{order.currentStage.name} · {orderTypeLabel(order.orderType)}</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Detalle del pedido</Text>
            <Text style={styles.sectionBadge}>{order.quantity} unidades</Text>
          </View>

          {order.lines.length > 0 ? order.lines.map((line) => <PaymentReceiptLine data={data} key={line.id} line={line} />) : null}
          {legacySelections ? (
            <View style={styles.line}>
              <View style={styles.specGrid}>
                {data.selections.map((selection) => (
                  <View key={selection.id} style={styles.specRow}>
                    <Text style={styles.specLabel}>{selectionLabel(selection)}</Text>
                    <Text style={styles.specValue}>{selection.itemName}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {order.lines.length === 0 && !legacySelections ? <Text style={styles.empty}>No hay renglones detallados disponibles.</Text> : null}

          {order.description?.trim() ? (
            <View wrap={false} style={styles.description}>
              <Text style={styles.label}>DESCRIPCIÓN DEL PEDIDO</Text>
              <Text style={styles.descriptionText}>{order.description.trim()}</Text>
            </View>
          ) : null}

          <View wrap={false} style={styles.paymentSummary}>
            <View style={styles.confirmation}>
              <Text style={styles.label}>PAGO REGISTRADO</Text>
              <Text style={styles.confirmationDate}>{formatDateTime(payment.confirmedAt)}</Text>
            </View>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL COBRADO</Text>
              <Text style={styles.totalValue}>{formatArsFromNumber(payment.amount)}</Text>
            </View>
          </View>
        </View>

        <ReceiptFooter />
      </Page>
    </Document>
  );
}

export function renderPaymentReceiptPdf(data: PaymentReceiptData) {
  return renderToBuffer(<PaymentReceiptDocument data={data} />);
}
