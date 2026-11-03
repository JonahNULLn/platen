/**
 * Debug-only: the date columns the date editor exposes per entity. Shared by
 * the debug menu (labels/inputs) and the server action (column whitelist — only
 * these may be written, so the editor can't touch arbitrary columns).
 *
 * `created_at` is the important one: it's auto-stamped "now", drives list
 * ordering + the activity timeline, and can't be set from the normal UI — so
 * backfilling historical orders needs it editable here.
 */

export type EntityKind = "quote" | "invoice" | "job" | "packing_slip";
export const entityKinds = ["quote", "invoice", "job", "packing_slip"] as const;

export type DateField = {
  /** DB column name. */
  column: string;
  label: string;
  /** Whether the column accepts null (empty input clears it). */
  nullable: boolean;
  /**
   * "date" columns store a bare YYYY-MM-DD. "timestamp" columns (created_at)
   * are timestamptz: the editor only changes the calendar day and keeps the
   * original time of day, so records moved onto the same day keep their
   * relative order in the created_at-sorted lists.
   */
  type: "date" | "timestamp";
};

export const DATE_FIELDS: Record<EntityKind, DateField[]> = {
  quote: [
    { column: "created_at", label: "Created", nullable: false, type: "timestamp" },
    { column: "quote_date", label: "Quote date", nullable: false, type: "date" },
    { column: "expires_at", label: "Expires", nullable: true, type: "date" },
  ],
  invoice: [
    { column: "created_at", label: "Created", nullable: false, type: "timestamp" },
    { column: "issue_date", label: "Issued", nullable: false, type: "date" },
    { column: "due_date", label: "Due", nullable: true, type: "date" },
  ],
  job: [
    { column: "created_at", label: "Created", nullable: false, type: "timestamp" },
    { column: "due_date", label: "Due", nullable: true, type: "date" },
  ],
  packing_slip: [
    { column: "created_at", label: "Generated", nullable: false, type: "timestamp" },
    // Empty = the slip prints the generated date as its ship date.
    { column: "ship_date", label: "Ship date", nullable: true, type: "date" },
  ],
};

/**
 * Move a stored timestamp onto a new calendar day (UTC — the DB's timezone, and
 * the day `formatDate` reads off the stored string), keeping its time of day.
 */
export function moveTimestampToDay(existing: unknown, day: string): string {
  const parsed = typeof existing === "string" ? new Date(existing) : null;
  const time =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(10) : "T12:00:00.000Z";
  return `${day}${time}`;
}

export const ENTITY_TABLE: Record<EntityKind, string> = {
  quote: "quotes",
  invoice: "invoices",
  job: "jobs",
  packing_slip: "packing_slips",
};

/**
 * Which column the id passed to the editor matches. A packing slip is reached
 * from its job's page, so it's looked up by job_id (one slip per job).
 */
export const ENTITY_KEY: Record<EntityKind, string> = {
  quote: "id",
  invoice: "id",
  job: "id",
  packing_slip: "job_id",
};

/** The app page that shows the entity, for revalidation after an edit. */
export function entityPath(kind: EntityKind, id: string): string {
  return kind === "packing_slip" ? `/jobs/${id}` : `/${ENTITY_TABLE[kind]}/${id}`;
}
