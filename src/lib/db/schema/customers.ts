import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./auth";

/**
 * customers — per-tenant CRM table. `tenant_id` is the org the customer
 * belongs to (FK to organizations). RLS scopes reads/writes by membership.
 *
 * Addresses: the unprefixed `address_*` columns are the customer's BILLING
 * address (they predate the split, so they keep their names rather than being
 * renamed out from under the string-based Supabase selects). `shipping_*` is
 * only meaningful when `ship_to_different` is true — otherwise goods go to the
 * billing address and a quote mirrors one into the other.
 *
 * Emails: `email` is the day-to-day contact. `billing_email` is optional and
 * only used for the "billed to" block on quotes and invoices; when it's blank
 * those documents fall back to the contact email.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    /** Day-to-day contact email. */
    email: text("email"),
    /** Optional invoicing email — overrides `email` on quotes/invoices only. */
    billingEmail: text("billing_email"),
    phone: text("phone"),
    // Billing address.
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    country: text("country").default("US"),
    /** When false, goods ship to the billing address and `shipping_*` is unused. */
    shipToDifferent: boolean("ship_to_different").default(false).notNull(),
    shippingAddressLine1: text("shipping_address_line1"),
    shippingAddressLine2: text("shipping_address_line2"),
    shippingCity: text("shipping_city"),
    shippingState: text("shipping_state"),
    shippingPostalCode: text("shipping_postal_code"),
    shippingCountry: text("shipping_country").default("US"),
    isTaxExempt: boolean("is_tax_exempt").default(false).notNull(),
    taxExemptId: text("tax_exempt_id"),
    defaultPaymentTerms: text("default_payment_terms"),
    notes: text("notes"),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customers_tenant_id_idx").on(table.tenantId),
    index("customers_tenant_company_idx").on(table.tenantId, table.company),
  ],
);
