import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { COLORS } from "@/lib/pdf/quote-pdf";

/**
 * Packing slip PDF — goes in the box. Same visual language as the quote /
 * invoice template (palette, type scale, grey table header) but no money
 * anywhere: just who it's from, where it's going, how it shipped, and what's
 * inside.
 */

export type PackingSlipRow = {
  /** "T-Shirt, Black". */
  name: string;
  /** Placements, e.g. "Left Chest (2 color) · Full Back (2 color)". */
  detail: string | null;
  /** One entry per size, e.g. ["S 40", "M 40"] — each prints on its own
   *  line. Empty for unsized items. */
  sizes: string[];
  ordered: number;
  shipped: number;
};

export type PackingSlip = {
  invoiceNumber: string;
  from: {
    name: string;
    address: string[];
    email: string | null;
    phone: string | null;
    logoUrl: string | null;
  };
  shipTo: { name: string | null; address: string[] };
  purchaseOrder: string | null;
  dateOrdered: string | null;
  shipDate: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  approvedBy: string | null;
  items: PackingSlipRow[];
  /** Already resolved — the builder substitutes defaults for unset options. */
  noteTitle: string;
  noteBody: string;
  footerText: string;
};

const FOOTER_TOP = 792 - 40 - 12;

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 72,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: COLORS.text,
    lineHeight: 1.35,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  logo: { height: 44, objectFit: "contain" },
  logoTextFallback: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  refLine: { fontSize: 10 },
  refLabel: { fontFamily: "Helvetica-Bold" },
  title: { fontSize: 36, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  twoCol: { flexDirection: "row", marginTop: 48, gap: 32 },
  twoColRow2: { flexDirection: "row", marginTop: 20, gap: 32 },
  column: { flex: 1 },
  colHeading: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 6 },
  colLine: { color: COLORS.muted, fontSize: 9.5 },
  metaLine: { fontSize: 9.5, color: COLORS.muted },
  metaLabel: { fontFamily: "Helvetica-Bold", color: COLORS.text },
  metaLink: { color: COLORS.muted, textDecoration: "underline" },
  table: { marginTop: 28 },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    backgroundColor: COLORS.headerBg,
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 0.3,
    borderBottomColor: COLORS.muted,
    color: COLORS.muted,
  },
  // Widths match the hand-made original: item ~half, sizes ~quarter.
  colItem: { flex: 4.2, paddingLeft: 12, paddingRight: 12 },
  colSizes: { flex: 2, paddingRight: 8 },
  colOrdered: { flex: 1, textAlign: "right" },
  colShipped: { flex: 1, textAlign: "right", paddingRight: 12 },
  // One size per line, each followed by an empty box to tick off by hand
  // while packing. The label has a fixed width so the boxes line up.
  sizeLine: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  sizeLabel: { width: 52 },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 0.75,
    borderColor: COLORS.muted,
    borderRadius: 1,
  },
  rowName: { fontSize: 10, color: COLORS.text },
  rowDetail: { fontSize: 8.5, color: COLORS.muted, marginTop: 2 },
  // The last item row closes the table with a heavier rule.
  tableEnd: { borderBottomWidth: 1, borderBottomColor: COLORS.muted },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 24,
    paddingTop: 14,
    paddingRight: 12,
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  note: { marginTop: 32 },
  noteLabel: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 3 },
  noteText: { fontSize: 9.5, color: COLORS.muted },
  // Pinned with `top`, not `bottom`: react-pdf mis-places `bottom`-anchored
  // fixed text that renders empty on some pages (it landed at the top of the
  // last page). LETTER is 792pt tall, so this sits ~40pt above the edge.
  footer: {
    position: "absolute",
    top: FOOTER_TOP,
    left: 48,
    right: 48,
    textAlign: "center",
    fontSize: 9.5,
    color: COLORS.muted,
  },
  // "Page 2 of 3" — only printed when the slip runs past one page.
  pageNumber: {
    position: "absolute",
    top: FOOTER_TOP,
    right: 48,
    fontSize: 8.5,
    color: COLORS.muted,
  },
});

function MetaRow({ label, value, href }: { label: string; value: string; href?: string | null }) {
  return (
    <Text style={styles.metaLine}>
      <Text style={styles.metaLabel}>{label}: </Text>
      {href ? (
        <Link src={href} style={styles.metaLink}>
          {value}
        </Link>
      ) : (
        value
      )}
    </Text>
  );
}

export function PackingSlipPdfDocument({ slip }: { slip: PackingSlip }) {
  const totalPieces = slip.items.reduce((sum, i) => sum + i.shipped, 0);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topRow}>
          <View>
            {slip.from.logoUrl ? (
              <Image style={styles.logo} src={slip.from.logoUrl} />
            ) : (
              <Text style={styles.logoTextFallback}>{slip.from.name}</Text>
            )}
          </View>
          <Text style={styles.refLine}>
            <Text style={styles.refLabel}>Invoice # </Text>
            {slip.invoiceNumber}
          </Text>
        </View>

        <Text style={styles.title}>PACKING SLIP</Text>

        <View style={styles.twoCol}>
          <View style={styles.column}>
            <Text style={styles.colHeading}>From</Text>
            <Text style={styles.colLine}>{slip.from.name}</Text>
            {slip.from.address.map((line) => (
              <Text key={line} style={styles.colLine}>
                {line}
              </Text>
            ))}
            {slip.from.email ? <Text style={styles.colLine}>{slip.from.email}</Text> : null}
            {slip.from.phone ? <Text style={styles.colLine}>{slip.from.phone}</Text> : null}
          </View>
          <View style={styles.column}>
            <Text style={styles.colHeading}>Shipment details</Text>
            {slip.purchaseOrder ? <MetaRow label="PO #" value={slip.purchaseOrder} /> : null}
            {slip.dateOrdered ? <MetaRow label="Date ordered" value={slip.dateOrdered} /> : null}
            {slip.shipDate ? <MetaRow label="Ship date" value={slip.shipDate} /> : null}
            {slip.carrier ? <MetaRow label="Carrier" value={slip.carrier} /> : null}
            {slip.trackingNumber ? (
              <MetaRow label="Tracking" value={slip.trackingNumber} href={slip.trackingUrl} />
            ) : null}
            {slip.approvedBy ? <MetaRow label="Approved by" value={slip.approvedBy} /> : null}
          </View>
        </View>

        <View style={styles.twoColRow2}>
          <View style={styles.column}>
            <Text style={styles.colHeading}>Shipped to</Text>
            {slip.shipTo.name ? <Text style={styles.colLine}>{slip.shipTo.name}</Text> : null}
            {slip.shipTo.address.map((line) => (
              <Text key={line} style={styles.colLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.column} />
        </View>

        <View style={styles.table}>
          {/* `fixed` repeats the header row at the top of every page the
              table runs onto, so a long slip stays readable. */}
          <View style={styles.tableHeader} fixed>
            <Text style={styles.colItem}>Item</Text>
            <Text style={styles.colSizes}>Sizes</Text>
            <Text style={styles.colOrdered}>Ordered</Text>
            <Text style={styles.colShipped}>Shipped</Text>
          </View>
          {slip.items.map((item, i) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: PDF rows are positional and read-only
              key={i}
              style={
                i === slip.items.length - 1 ? [styles.tableRow, styles.tableEnd] : styles.tableRow
              }
              wrap={false}
            >
              <View style={styles.colItem}>
                <Text style={styles.rowName}>{item.name}</Text>
                {item.detail ? <Text style={styles.rowDetail}>{item.detail}</Text> : null}
              </View>
              <View style={styles.colSizes}>
                {/* Unsized items still get one box, so every line can be checked. */}
                {(item.sizes.length > 0 ? item.sizes : ["—"]).map((size) => (
                  <View key={size} style={styles.sizeLine}>
                    <Text style={styles.sizeLabel}>{size}</Text>
                    <View style={styles.checkbox} />
                  </View>
                ))}
              </View>
              <Text style={styles.colOrdered}>{item.ordered}</Text>
              <Text style={styles.colShipped}>{item.shipped}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow} wrap={false}>
          <Text style={styles.totalLabel}>Total pieces</Text>
          <Text style={styles.totalValue}>{totalPieces}</Text>
        </View>

        <View style={styles.note} wrap={false}>
          <Text style={styles.noteLabel}>{slip.noteTitle}</Text>
          <Text style={styles.noteText}>{slip.noteBody}</Text>
        </View>

        {/* Sign-off on the last page only; page numbers once there's more than one. */}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            pageNumber === totalPages ? slip.footerText : ""
          }
        />
        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ""
          }
        />
      </Page>
    </Document>
  );
}
