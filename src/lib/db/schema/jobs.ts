import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, profiles } from "./auth";
import { customers } from "./customers";
import { invoices } from "./invoices";

/**
 * Jobs schema (spec §7 flows F + G).
 *
 * A Job is the production view of an order — generated from a deposit-paid/paid
 * invoice, 1:1 with that invoice. Production is tracked per WORK UNIT (a group
 * of items sharing a decoration method/design), each with its own status +
 * checklist. The job's status rolls up from its units. `job_events` is the
 * activity log so a busy shop never re-checks "is this done?".
 */

// Order-level status (rolls up from the work units; delivered/cancelled are
// set at the order level).
export const jobStatuses = [
  "scheduled",
  "pre_production",
  "in_production",
  "post_production",
  "ready",
  "delivered",
  "cancelled",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

// Per-work-unit production stage (the production board's lanes). No "delivered"
// — delivery is an order-level act.
export const workUnitStatuses = [
  "scheduled",
  "pre_production",
  "in_production",
  "post_production",
  "ready",
  "cancelled",
] as const;
export type WorkUnitStatus = (typeof workUnitStatuses)[number];

/** One checklist task within a work unit, seeded from an invoice line item. */
export type JobChecklistItem = {
  id: string;
  label: string;
  qty?: number | null;
  done: boolean;
  /** The invoice line item this task came from, for traceability. */
  sourceInvoiceLineItemId?: string | null;
};

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // 1:1 with the invoice it was generated from.
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    // Snapshot for display even if the customer is later deleted.
    customerName: text("customer_name"),
    // Mirrors the invoice number for at-a-glance reference (no separate sequence).
    invoiceNumber: text("invoice_number"),
    status: text("status").notNull().default("scheduled"),
    dueDate: date("due_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("jobs_invoice_id_unique").on(table.invoiceId),
    index("jobs_tenant_status_idx").on(table.tenantId, table.status),
    index("jobs_tenant_id_idx").on(table.tenantId),
  ],
);

export const jobWorkUnits = pgTable(
  "job_work_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Decoration method (screen_print | embroidery | dtg | ...). Nullable for
    // now — left in place so design-based auto-grouping can populate it later.
    method: text("method"),
    status: text("status").notNull().default("scheduled"),
    checklist: jsonb("checklist").$type<JobChecklistItem[]>(),
    assigneeId: uuid("assignee_id").references(() => profiles.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("job_work_units_job_id_idx").on(table.jobId),
    index("job_work_units_tenant_status_idx").on(table.tenantId, table.status),
    index("job_work_units_assignee_idx").on(table.assigneeId),
  ],
);

export const jobEvents = pgTable(
  "job_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    workUnitId: uuid("work_unit_id").references(() => jobWorkUnits.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    // created | status_change | checklist | note | assigned
    type: text("type").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("job_events_job_id_idx").on(table.jobId)],
);

/**
 * A job's packing slip. The slip's contents (items, ship-to, tracking) render
 * from the invoice snapshot each time it's opened; this row records that one
 * was generated, plus per-slip options.
 *
 * Every option column is NULLABLE and NULL MEANS "USE THE DEFAULT" — the
 * renderer fills in its built-in text/behaviour for anything left empty. So
 * new options can be added later without backfilling, and existing slips just
 * keep rendering the default way.
 */
export const packingSlips = pgTable(
  "packing_slips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // One slip per job for now. Partial shipments (several slips per job)
    // would mean dropping this unique constraint.
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),

    // ── Options (NULL = default) ────────────────────────────────────────
    /** Printed "Ship date". Default: the day the slip was generated. */
    shipDate: date("ship_date"),
    /** Bold line under the items. Default: "Please count and inspect your order on arrival." */
    noteTitle: text("note_title"),
    /** Text under the note title. Default: the "reach out to <org email>" line. */
    noteBody: text("note_body"),
    /** Bottom-of-page line. Default: "Thank you for your business!" */
    footerText: text("footer_text"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("packing_slips_job_id_unique").on(table.jobId),
    index("packing_slips_tenant_id_idx").on(table.tenantId),
  ],
);
