"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveContext } from "@/lib/auth/session";
import {
  DATE_FIELDS,
  ENTITY_KEY,
  ENTITY_TABLE,
  type EntityKind,
  entityKinds,
  entityPath,
  moveTimestampToDay,
} from "@/lib/debug/date-fields";
import { createClient } from "@/lib/supabase/server";

type DatesResult = { ok: true; dates: Record<string, string> } | { ok: false; error: string };
type Result = { ok: true } | { ok: false; error: string };
type NumberResult = { ok: true; number: string } | { ok: false; error: string };

const MANAGE_ROLES = new Set(["owner", "admin"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reduce a stored value (date or timestamptz) to YYYY-MM-DD for a date input. */
function toDateInput(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return value.slice(0, 10);
}

/**
 * Debug-only: read an entity's editable date columns. Tenant-scoped. Returns a
 * `column -> YYYY-MM-DD` map (empty string for null).
 */
export async function getEntityDates(kind: EntityKind, id: string): Promise<DatesResult> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  const fields = DATE_FIELDS[kind];
  if (!fields) return { ok: false, error: "Unknown entity" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(ENTITY_TABLE[kind])
    .select(fields.map((f) => f.column).join(", "))
    .eq(ENTITY_KEY[kind], id)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<Record<string, unknown>>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found" };

  const dates: Record<string, string> = {};
  for (const f of fields) dates[f.column] = toDateInput(data[f.column]);
  return { ok: true, dates };
}

const setEntityDatesSchema = z.object({
  kind: z.enum(entityKinds),
  id: z.string().uuid(),
  values: z.record(z.string(), z.string()),
});

/**
 * Debug-only: overwrite an entity's date columns (including created_at, which
 * the normal UI can't touch — used to backfill historical orders with real
 * dates). Owner/admin + tenant-scoped; only whitelisted columns are written.
 *
 * Only columns whose calendar day actually changed are written, and
 * created_at keeps its time of day — so saving one field never silently
 * rewrites the others. Returns the stored dates after the write.
 */
export async function setEntityDates(
  kind: EntityKind,
  id: string,
  values: Record<string, string>,
): Promise<DatesResult> {
  const parsed = setEntityDatesSchema.safeParse({ kind, id, values });
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can edit dates." };
  }
  const fields = DATE_FIELDS[parsed.data.kind];
  const table = ENTITY_TABLE[parsed.data.kind];
  const key = ENTITY_KEY[parsed.data.kind];

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from(table)
    .select(fields.map((f) => f.column).join(", "))
    .eq(key, parsed.data.id)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<Record<string, unknown>>();
  if (readError) return { ok: false, error: readError.message };
  if (!current) return { ok: false, error: "Not found" };

  const update: Record<string, string | null> = {};
  for (const f of fields) {
    const raw = parsed.data.values[f.column];
    if (raw === undefined) continue;
    const day = raw.trim();
    if (day === toDateInput(current[f.column])) continue; // unchanged
    if (day === "") {
      if (!f.nullable) return { ok: false, error: `${f.label} can't be empty.` };
      update[f.column] = null;
    } else {
      if (!ISO_DATE.test(day)) return { ok: false, error: `${f.label} must be a valid date.` };
      update[f.column] = f.type === "timestamp" ? moveTimestampToDay(current[f.column], day) : day;
    }
  }

  if (Object.keys(update).length > 0) {
    // .select() so a write that matched no row (RLS, wrong tenant) is an
    // error instead of a silent no-op reported as success.
    const { data: written, error } = await supabase
      .from(table)
      .update(update)
      .eq(key, parsed.data.id)
      .eq("tenant_id", ctx.orgId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!written || written.length === 0) {
      return { ok: false, error: "Nothing was updated — the record may be locked or missing." };
    }
  }

  revalidatePath(entityPath(parsed.data.kind, parsed.data.id));
  revalidatePath(`/${table}`);
  revalidatePath("/dashboard");
  revalidatePath("/production");
  revalidatePath("/reports");

  return getEntityDates(parsed.data.kind, parsed.data.id);
}

/** Debug-only: read a quote's current number. Tenant-scoped. */
export async function getQuoteNumber(quoteId: string): Promise<NumberResult> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("quote_number")
    .eq("id", quoteId)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<{ quote_number: string }>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found" };
  return { ok: true, number: data.quote_number };
}

/**
 * Debug-only: overwrite a quote's number (handy when numbering is random and you
 * want a specific value). Owner/admin + tenant-scoped; rejects duplicates.
 */
export async function setQuoteNumber(quoteId: string, quoteNumber: string): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can edit the quote number." };
  }
  const value = quoteNumber.trim();
  if (!value) return { ok: false, error: "Quote number can't be empty." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({ quote_number: value })
    .eq("id", quoteId)
    .eq("tenant_id", ctx.orgId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That quote number is already in use." };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
  return { ok: true };
}

export type MigratableQuote = {
  id: string;
  quoteNumber: string;
  customer: string;
  logoUrl: string | null;
  quoteDate: string | null;
};
type MigratableResult = { ok: true; quotes: MigratableQuote[] } | { ok: false; error: string };

/** Debug-only: approved quotes that haven't been turned into an invoice yet. */
export async function getMigratableQuotes(): Promise<MigratableResult> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };

  const supabase = await createClient();
  const [{ data: quotes, error }, { data: invoiced }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_number, quote_date, customer_name, customer_company, customers(logo_url)")
      .eq("tenant_id", ctx.orgId)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    supabase.from("invoices").select("quote_id").eq("tenant_id", ctx.orgId),
  ]);
  if (error) return { ok: false, error: error.message };

  const taken = new Set(
    ((invoiced as { quote_id: string | null }[] | null) ?? [])
      .map((r) => r.quote_id)
      .filter((v): v is string => v !== null),
  );
  const rows = (quotes ?? []) as unknown as {
    id: string;
    quote_number: string;
    quote_date: string | null;
    customer_name: string | null;
    customer_company: string | null;
    customers: { logo_url: string | null } | null;
  }[];
  const list: MigratableQuote[] = rows
    .filter((q) => !taken.has(q.id))
    .map((q) => ({
      id: q.id,
      quoteNumber: q.quote_number,
      customer: q.customer_company || q.customer_name || "—",
      logoUrl: q.customers?.logo_url ?? null,
      quoteDate: q.quote_date,
    }));
  return { ok: true, quotes: list };
}

/**
 * Debug-only: fast-forward one approved quote to a delivered, paid order — the
 * whole invoice → payment → job → delivered flow, backdated to the quote's
 * dates. Atomic inside migrate_quote_to_delivered. Owner/admin only.
 */
export async function migrateQuote(quoteId: string): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can migrate quotes." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("migrate_quote_to_delivered", { p_quote_id: quoteId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/quotes");
  revalidatePath("/invoices");
  revalidatePath("/jobs");
  return { ok: true };
}

export type JobActivityItem = {
  id: string;
  type: string;
  message: string;
  date: string; // YYYY-MM-DD
  actor: string | null;
};
type JobActivityResult = { ok: true; events: JobActivityItem[] } | { ok: false; error: string };

/** Debug-only: read a job's activity log (job_events) with dates. Tenant-scoped. */
export async function getJobActivity(jobId: string): Promise<JobActivityResult> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_events")
    .select("id, type, message, created_at, profiles(first_name, last_name)")
    .eq("job_id", jobId)
    .eq("tenant_id", ctx.orgId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as unknown as {
    id: string;
    type: string;
    message: string;
    created_at: string | null;
    profiles: { first_name: string | null; last_name: string | null } | null;
  }[];
  const events: JobActivityItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    date: toDateInput(r.created_at),
    actor: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || null,
  }));
  return { ok: true, events };
}

const setJobActivityDatesSchema = z.object({
  jobId: z.string().uuid(),
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      date: z.string().trim().regex(ISO_DATE, "Each date must be a valid date."),
    }),
  ),
});

/**
 * Debug-only: backdate a job's activity events. Each listed event moves to the
 * given day, keeping its time of day so the log's order within a day survives.
 * Events already on that day are skipped. Owner/admin + tenant-scoped; only
 * events on this job are touched.
 */
export async function setJobActivityDates(
  jobId: string,
  updates: { id: string; date: string }[],
): Promise<Result> {
  const parsed = setJobActivityDatesSchema.safeParse({ jobId, updates });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can edit activity dates." };
  }

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("job_events")
    .select("id, created_at")
    .eq("job_id", parsed.data.jobId)
    .eq("tenant_id", ctx.orgId);
  if (readError) return { ok: false, error: readError.message };
  const current = new Map(
    ((rows ?? []) as { id: string; created_at: string | null }[]).map((r) => [r.id, r.created_at]),
  );

  for (const u of parsed.data.updates) {
    if (!current.has(u.id)) return { ok: false, error: "That event isn't on this job." };
    const existing = current.get(u.id);
    if (toDateInput(existing) === u.date) continue; // unchanged
    const { data: written, error } = await supabase
      .from("job_events")
      .update({ created_at: moveTimestampToDay(existing, u.date) })
      .eq("id", u.id)
      .eq("job_id", parsed.data.jobId)
      .eq("tenant_id", ctx.orgId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!written || written.length === 0) {
      return { ok: false, error: "An event couldn't be updated — it may be locked or missing." };
    }
  }

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Debug-only: delete a job's packing slip, so the job goes back to showing
 * "Generate packing slip". Owner/admin + tenant-scoped.
 */
export async function deletePackingSlip(jobId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, error: "Invalid job" };

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can delete packing slips." };
  }

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("packing_slips")
    .delete()
    .eq("job_id", jobId)
    .eq("tenant_id", ctx.orgId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "This job doesn't have a packing slip." };
  }

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
