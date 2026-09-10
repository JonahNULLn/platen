import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { PaymentInstallment } from "@/lib/payments/payment-terms";
import { organizations, profiles } from "./auth";
import { customers } from "./customers";
import type { PlacementEntry, SizeBreakdownEntry } from "./quotes";
import { quotes } from "./quotes";

/**
 * Invoices schema (spec §7 flows D + E).
 *
 * An invoice is generated from an APPROVED quote and is an immutable snapshot:
 * its line items + customer fields are copied at generation time, so later
 * edits to the quote/customer never change an issued invoice. `amount_due` is a
 * generated column (total − amount_paid); a trigger keeps `amount_paid` + status
 * in sync as `invoice_payments` rows are added/removed.
 */

export const invoiceStatuses = [
  "pending",
  "deposit_paid",
  "paid",
  "overdue",
  "refunded",
  "void",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** Common payment methods (free text in the DB; this is just the UI default set). */
export const paymentMethods = ["cash", "card", "check", "ach", "other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    // Link back to the source quote (snapshot — quote edits don't flow through).
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    issueDate: date("issue_date").defaultNow().notNull(),
    dueDate: date("due_date"),
    /** Customer's PO number — snapshotted from the quote, then kept in sync. */
    purchaseOrder: text("purchase_order"),
    /** Who approved the source quote. Snapshotted so the invoice PDF can show
     *  it without joining back to a quote that may since have been revised. */
    approvedByName: text("approved_by_name"),

    // Customer snapshot (shipping) — preserved if the customer is deleted.
    customerName: text("customer_name"),
    customerCompany: text("customer_company"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    customerAddressLine1: text("customer_address_line1"),
    customerAddressLine2: text("customer_address_line2"),
    customerCity: text("customer_city"),
    customerState: text("customer_state"),
    customerPostalCode: text("customer_postal_code"),
    customerCountry: text("customer_country").default("US"),

    // Billing address snapshot.
    billToSameAsShipping: boolean("bill_to_same_as_shipping").default(true).notNull(),
    billToLine1: text("bill_to_line1"),
    billToLine2: text("bill_to_line2"),
    billToCity: text("bill_to_city"),
    billToState: text("bill_to_state"),
    billToPostalCode: text("bill_to_postal_code"),
    billToCountry: text("bill_to_country").default("US"),
    /** Invoicing email override. Null = use the contact email (customerEmail). */
    billToEmail: text("bill_to_email"),

    customerTaxExemptId: text("customer_tax_exempt_id"),

    // Money (snapshot of the quote's computed totals).
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).default("0"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    isTaxExempt: boolean("is_tax_exempt").default(false).notNull(),
    /** The shipping actually billed: `shippingActual` once known, else the cap. */
    shippingAmount: numeric("shipping_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    /** Snapshotted from the quote — one of `shippingModes`. */
    shippingMode: text("shipping_mode").default("standard").notNull(),
    /** The not-to-exceed figure quoted, kept when mode is "estimate" so the
     *  real cost can be entered later without losing what was promised. */
    shippingCap: numeric("shipping_cap", { precision: 12, scale: 2 }),
    /** Real shipping cost, filled in on the invoice once the order ships.
     *  Null means "not known yet" — the invoice still bills the cap. */
    shippingActual: numeric("shipping_actual", { precision: 12, scale: 2 }),
    /** Carrier tracking number, entered alongside the actual shipping cost. */
    trackingNumber: text("tracking_number"),
    /** One of `shippingCarriers` — drives the tracking deep-link. "other"
     *  (or null) means we can't build a URL, so the number stays plain text. */
    shippingCarrier: text("shipping_carrier"),
    discountType: text("discount_type").default("amount").notNull(),
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).default("0").notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    depositType: text("deposit_type").default("amount").notNull(),
    depositValue: numeric("deposit_value", { precision: 12, scale: 2 }).default("0").notNull(),
    depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).default("0").notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }).default("0"),
    profit: numeric("profit", { precision: 12, scale: 2 }).default("0"),

    // Payment tracking. amount_paid is maintained by a trigger from
    // invoice_payments; amount_due is a generated column.
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).default("0").notNull(),
    amountDue: numeric("amount_due", { precision: 12, scale: 2 }).generatedAlwaysAs(
      sql`total - amount_paid`,
    ),

    notes: text("notes"),
    internalNotes: text("internal_notes"),
    terms: text("terms"),
    paymentTerms: text("payment_terms"),
    /** Never empty — a DB trigger coerces NULL / "" / "None" to "Check". */
    paymentMethodDefault: text("payment_method_default").default("Check"),
    /** Snapshotted from the source quote when the invoice is generated. */
    paymentSchedule: jsonb("payment_schedule").$type<PaymentInstallment[]>(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("invoices_tenant_number_unique").on(table.tenantId, table.invoiceNumber),
    index("invoices_tenant_status_idx").on(table.tenantId, table.status),
    index("invoices_tenant_customer_idx").on(table.tenantId, table.customerId),
    index("invoices_quote_id_idx").on(table.quoteId),
  ],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    // The source quote line item, for traceability (not a FK dependency).
    sourceQuoteLineItemId: uuid("source_quote_line_item_id"),
    itemType: text("item_type").notNull().default("product"),
    name: text("name").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
    unitCost: numeric("unit_cost", { precision: 10, scale: 2 }),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull().default("0"),
    totalCost: numeric("total_cost", { precision: 12, scale: 2 }).default("0"),
    sortOrder: integer("sort_order"),
    sizesBreakdown: jsonb("sizes_breakdown").$type<SizeBreakdownEntry[]>(),
    placementsData: jsonb("placements_data").$type<PlacementEntry[]>(),
    colorName: text("color_name"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("invoice_line_items_invoice_id_idx").on(table.invoiceId)],
);

export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    method: text("method"),
    reference: text("reference"),
    paidOn: date("paid_on").defaultNow().notNull(),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("invoice_payments_invoice_id_idx").on(table.invoiceId),
    index("invoice_payments_tenant_id_idx").on(table.tenantId),
  ],
);
