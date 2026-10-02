import {
  type AnyPgColumn,
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
import { organizations } from "./auth";
import { tenantProducts } from "./catalog";
import { customers } from "./customers";

/**
 * Quotes schema (spec §5 + QUOTE_PAGE_ELEMENTS.md).
 *
 * Quotes snapshot the customer's fields so deleting a customer never breaks a
 * historical quote. Line items carry their sizes/placements as JSONB (variable
 * shape per item). Money lives in NUMERIC; discount/deposit store the entered
 * type+value plus the computed applied amount.
 */

export const quoteStatuses = [
  "draft",
  "sent",
  "viewed",
  "revised",
  "approved",
  "declined",
  "expired",
] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export const lineItemTypes = ["product", "custom", "fee"] as const;
export type LineItemType = (typeof lineItemTypes)[number];

export const adjustmentTypes = ["amount", "percent"] as const;
export type AdjustmentType = (typeof adjustmentTypes)[number];

// Shipping modes are defined in lib/quotes/shipping.ts (client-safe) and
// re-exported here so schema consumers can reach them the usual way.
export { type ShippingMode, shippingModes } from "@/lib/quotes/shipping";

/** One size's quantity + price within a line item's `sizes_breakdown`. */
export type SizeBreakdownEntry = {
  size: string;
  qty: number;
  unitPrice: number;
  /** Per-size wholesale cost (distributor variant); absent/null for custom items. */
  unitCost?: number | null;
  /** true when this size's price was manually overridden. */
  overridden?: boolean;
  /**
   * true when this size's cost was typed in rather than taken from the
   * distributor's wholesale price (a deal, a different supplier, freight…).
   * Cost side only — never changes the price.
   */
  costOverridden?: boolean;
};

/** One placement within a line item's `placements_data`. */
export type PlacementEntry = {
  placementId: string | null;
  placementName: string;
  colorCount: number;
  price: number;
  /**
   * What one ink color cost us at this placement when it was picked —
   * snapshotted so later rate changes don't rewrite past profit. Cost side
   * only. Absent on quotes saved before ink cost existed; null for
   * hand-typed placements.
   */
  inkCostPerColor?: number | null;
};

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quoteNumber: text("quote_number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    quoteDate: date("quote_date").defaultNow().notNull(),
    expiresAt: date("expires_at"),
    version: integer("version").notNull().default(1),
    parentQuoteId: uuid("parent_quote_id").references((): AnyPgColumn => quotes.id, {
      onDelete: "set null",
    }),
    /**
     * Customer's purchase-order number. Copied onto the invoice at generation
     * time and kept in sync with it afterwards — editing either side updates
     * both, so the pair always shows one PO.
     */
    purchaseOrder: text("purchase_order"),

    // Customer snapshot (shipping address) — preserved if the customer is deleted.
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

    // Money.
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).default("0"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    isTaxExempt: boolean("is_tax_exempt").default(false).notNull(),
    shippingAmount: numeric("shipping_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    /** One of `shippingModes`. "estimate" means shippingAmount is a cap. */
    shippingMode: text("shipping_mode").default("standard").notNull(),
    discountType: text("discount_type").default("amount").notNull(),
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).default("0").notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    depositType: text("deposit_type").default("amount").notNull(),
    depositValue: numeric("deposit_value", { precision: 12, scale: 2 }).default("0").notNull(),
    depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).default("0").notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }).default("0"),
    profit: numeric("profit", { precision: 12, scale: 2 }).default("0"),

    notes: text("notes"),
    internalNotes: text("internal_notes"),
    terms: text("terms"),
    paymentTerms: text("payment_terms"),
    /** Never empty — a DB trigger coerces NULL / "" / "None" to "Check". */
    paymentMethodDefault: text("payment_method_default").default("Check"),
    /** Snapshot of the chosen payment term's installments (variable shape). */
    paymentSchedule: jsonb("payment_schedule").$type<PaymentInstallment[]>(),

    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByName: text("approved_by_name"),
    approvedBySignatureData: text("approved_by_signature_data"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("quotes_tenant_number_version_unique").on(
      table.tenantId,
      table.quoteNumber,
      table.version,
    ),
    index("quotes_tenant_status_idx").on(table.tenantId, table.status),
    index("quotes_tenant_customer_idx").on(table.tenantId, table.customerId),
  ],
);

export const quoteLineItems = pgTable(
  "quote_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    tenantProductId: uuid("tenant_product_id").references(() => tenantProducts.id, {
      onDelete: "set null",
    }),
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
  (table) => [index("quote_line_items_quote_id_idx").on(table.quoteId)],
);

export const quoteLineItemImages = pgTable(
  "quote_line_item_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quoteLineItemId: uuid("quote_line_item_id")
      .notNull()
      .references(() => quoteLineItems.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    sortOrder: integer("sort_order"),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("quote_line_item_images_item_id_idx").on(table.quoteLineItemId)],
);
