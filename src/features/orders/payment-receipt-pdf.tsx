import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatArsFromNumber, formatDateTime, formatOrderNumber, orderTypeLabel, selectionLabel } from "./detail-format";
import { buildOrderSpecificationSections } from "./components/order-specifications";
import type { OrderDetailData } from "./detail-queries";
import type { ActiveOrderPayment } from "./payment-receipt";

export const PAYMENT_RECEIPT_TITLE = "Comprobante de pago";
export const PAYMENT_RECEIPT_DISCLAIMER = "Constancia interna de cobro. No es una factura fiscal.";

export type PaymentReceiptData = OrderDetailData & {
  payment: ActiveOrderPayment;
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    color: "#1F2937",
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingBottom: 48,
    paddingHorizontal: 42,
    paddingTop: 42,
  },
  header: {
    borderBottomColor: "#D1D5DB",
    borderBottomWidth: 1,
    marginBottom: 20,
    paddingBottom: 12,
  },
  brand: {
    color: "#6B7280",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  title: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "bold",
    marginTop: 6,
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 9,
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#374151",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 0.8,
    marginBottom: 7,
    textTransform: "uppercase",
  },
  metadata: {
    borderColor: "#E5E7EB",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
  },
  metadataItem: {
    marginBottom: 5,
    width: "50%",
  },
  label: {
    color: "#6B7280",
    fontSize: 8,
    marginBottom: 3,
  },
  value: {
    color: "#111827",
    fontSize: 10,
  },
  line: {
    borderColor: "#E5E7EB",
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
  },
  lineHeading: {
    color: "#111827",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lineNumber: {
    color: "#6B7280",
    fontSize: 8,
  },
  lineProduct: {
    fontSize: 10,
    fontWeight: "bold",
  },
  specSection: {
    marginTop: 7,
  },
  specTitle: {
    color: "#4B5563",
    fontSize: 8,
    fontWeight: "bold",
    marginBottom: 3,
  },
  specRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  specLabel: {
    color: "#6B7280",
    width: "32%",
  },
  specValue: {
    color: "#1F2937",
    flex: 1,
  },
  empty: {
    color: "#6B7280",
    fontSize: 9,
  },
  total: {
    alignItems: "flex-end",
    borderTopColor: "#9CA3AF",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  totalLabel: {
    color: "#4B5563",
    fontSize: 9,
  },
  totalValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 3,
  },
  footer: {
    bottom: 22,
    color: "#6B7280",
    flexDirection: "row",
    fontSize: 8,
    justifyContent: "space-between",
    left: 42,
    position: "absolute",
    right: 42,
  },
});

function display(value: string | null | undefined) {
  return value?.trim() || "Sin completar";
}

function PaymentReceiptLine({ data, line }: { data: PaymentReceiptData; line: PaymentReceiptData["order"]["lines"][number] }) {
  const sections = buildOrderSpecificationSections(line, data.catalogs, data.selections);

  return (
    <View style={styles.line}>
      <View style={styles.lineHeading}>
        <View>
          <Text style={styles.lineNumber}>Renglón {line.position + 1}</Text>
          <Text style={styles.lineProduct}>{display(line.productName)}</Text>
        </View>
        <Text style={styles.value}>{line.quantity} unidades</Text>
      </View>
      {sections.map((section) => (
        <View key={section.title} style={styles.specSection}>
          <Text style={styles.specTitle}>{section.title}</Text>
          {section.items.map((item, index) => (
            <View key={`${section.title}-${item.label}-${index}`} style={styles.specRow}>
              <Text style={styles.specLabel}>{item.label}</Text>
              <Text style={styles.specValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function PaymentReceiptDocument({ data }: { data: PaymentReceiptData }) {
  const { order, payment } = data;
  const legacySelections = data.selections.length > 0 && order.lines.length === 0;

  return (
    <Document author="Digraf" subject={PAYMENT_RECEIPT_TITLE} title={`${PAYMENT_RECEIPT_TITLE} ${formatOrderNumber(order.publicNumber)}`}>
      <Page size="A4" style={styles.page} wrap>
        <View fixed style={styles.header}>
          <Text style={styles.brand}>DIGRAF · REGISTRO INTERNO</Text>
          <Text style={styles.title}>{PAYMENT_RECEIPT_TITLE}</Text>
          <Text style={styles.subtitle}>{PAYMENT_RECEIPT_DISCLAIMER}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identificación</Text>
          <View style={styles.metadata}>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Pedido</Text>
              <Text style={styles.value}>{formatOrderNumber(order.publicNumber)}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Fecha y hora del movimiento</Text>
              <Text style={styles.value}>{formatDateTime(payment.confirmedAt)}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Registró</Text>
              <Text style={styles.value}>{display(payment.actorDisplayName)}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Estado del pedido</Text>
              <Text style={styles.value}>{order.currentStage.name}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.metadata}>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Cliente</Text>
              <Text style={styles.value}>{display(order.clientName ?? order.customerName)}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Equipo</Text>
              <Text style={styles.value}>{display(order.teamName)}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Teléfono</Text>
              <Text style={styles.value}>{display(order.phone)}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.label}>Tipo de pedido</Text>
              <Text style={styles.value}>{orderTypeLabel(order.orderType)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle del pedido</Text>
          {order.lines.length > 0 ? order.lines.map((line) => <PaymentReceiptLine data={data} key={line.id} line={line} />) : null}
          {legacySelections ? (
            <View style={styles.line}>
              {data.selections.map((selection) => (
                <View key={selection.id} style={styles.specRow}>
                  <Text style={styles.specLabel}>{selectionLabel(selection)}</Text>
                  <Text style={styles.specValue}>{selection.itemName}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {order.lines.length === 0 && !legacySelections ? <Text style={styles.empty}>No hay renglones detallados disponibles.</Text> : null}
        </View>

        {order.description?.trim() ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.value}>{order.description.trim()}</Text>
          </View>
        ) : null}

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Monto cobrado</Text>
          <Text style={styles.totalValue}>{formatArsFromNumber(payment.amount)}</Text>
        </View>

        <View fixed style={styles.footer}>
          <Text>{PAYMENT_RECEIPT_DISCLAIMER}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderPaymentReceiptPdf(data: PaymentReceiptData) {
  return renderToBuffer(<PaymentReceiptDocument data={data} /> as Parameters<typeof renderToBuffer>[0]);
}
