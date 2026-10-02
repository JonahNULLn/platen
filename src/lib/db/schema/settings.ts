import {
  boolean,
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

/**
 * Pricing-rules schema (spec §5). All tenant-scoped — these drive quote
 * calculations in Phase 6.
 *   - placement_options: where decoration can go + its default price
 *   - color_count_pricing: per-garment price by # of ink colors (tiered)
 *   - fees: standard charges (screen, setup, rush, art), optionally per-color
 *
 * (document_templates lands with the quote/invoice PDF work in Phase 6/7.)
 */

/** Where decoration can go on a garment (Front Center, Full Back, …). */
export const placementOptions = pgTable(
  "placement_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultPrice: numeric("default_price", { precision: 10, scale: 2 }).default("0"),
    /**
     * What one ink color costs US for one print at this placement, per garment
     * (a full back uses far more ink than a left chest). Print cost = this x
     * the number of colors. Four decimals because ink is often a fraction of a
     * cent per print. Cost side only — never shown to customers.
     */
    inkCostPerColor: numeric("ink_cost_per_color", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("placement_options_tenant_id_idx").on(table.tenantId)],
);

/** Tiered pricing by number of ink colors in a print. */
export const colorCountPricing = pgTable(
  "color_count_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    colorCount: integer("color_count").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    unique("color_count_pricing_tenant_count_unique").on(table.tenantId, table.colorCount),
    index("color_count_pricing_tenant_id_idx").on(table.tenantId),
  ],
);

/**
 * Reusable payment-term presets (Paid in full, Net 30, 50% deposit, …). Each
 * is a name + an ordered list of installments stored as JSONB (variable shape).
 * Quotes/invoices snapshot the chosen term's installments, so editing a preset
 * never rewrites issued documents.
 */
export const paymentTermOptions = pgTable(
  "payment_term_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    installments: jsonb("installments").$type<PaymentInstallment[]>().default([]).notNull(),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("payment_term_options_tenant_id_idx").on(table.tenantId)],
);

/** Standard charges applied during quote building. */
export const fees = pgTable(
  "fees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultAmount: numeric("default_amount", { precision: 10, scale: 2 }).default("0"),
    isPerColor: boolean("is_per_color").default(false).notNull(),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("fees_tenant_id_idx").on(table.tenantId)],
);
