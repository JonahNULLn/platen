"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveContext } from "@/lib/auth/session";
import { type JobChecklistItem, type WorkUnitStatus, workUnitStatuses } from "@/lib/db/schema/jobs";
import { notifyOrg } from "@/lib/notifications/notify";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
type GenerateResult = { ok: true; jobId: string } | { ok: false; error: string };

const MANAGE_ROLES = new Set(["owner", "admin"]);
const PRODUCTION_ROLES = new Set(["owner", "admin", "production"]);

// Least-advanced order for rolling work-unit statuses up to the job.
const STAGE_ORDER = [
  "scheduled",
  "pre_production",
  "in_production",
  "post_production",
  "ready",
] as const;

/** Roll the parent job's status up from its work units (least-advanced wins). */
function rollupJobStatus(unitStatuses: string[]): string {
  const active = unitStatuses.filter((s) => s !== "cancelled");
  if (active.length === 0) return unitStatuses.length > 0 ? "cancelled" : "scheduled";
  let minIdx = STAGE_ORDER.length - 1;
  for (const s of active) {
    const i = STAGE_ORDER.indexOf(s as (typeof STAGE_ORDER)[number]);
    if (i >= 0 && i < minIdx) minIdx = i;
  }
  return STAGE_ORDER[minIdx] ?? "scheduled";
}

/**
 * Apply a work-unit status change: update the unit, roll it up to the parent
 * job, and log an event. Assumes the caller already authorized the change.
 */
async function applyUnitStatusChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  unit: { id: string; job_id: string; name: string; status: string },
  newStatus: string,
  message: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("job_work_units")
    .update({ status: newStatus, status_changed_at: new Date().toISOString() })
    .eq("id", unit.id)
    .eq("tenant_id", orgId);
  if (error) return error.message;

  // Roll the change up to the parent job (unless it's in a terminal state).
  const { data: units } = await supabase
    .from("job_work_units")
    .select("status")
    .eq("job_id", unit.job_id)
    .eq("tenant_id", orgId);
  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", unit.job_id)
    .maybeSingle<{ status: string }>();
  if (job && job.status !== "delivered" && job.status !== "cancelled") {
    const rolled = rollupJobStatus((units ?? []).map((u) => u.status as string));
    if (rolled !== job.status) {
      await supabase.from("jobs").update({ status: rolled }).eq("id", unit.job_id);
    }
  }

  await supabase.from("job_events").insert({
    tenant_id: orgId,
    job_id: unit.job_id,
    work_unit_id: unit.id,
    actor_id: userId,
    type: "status_change",
    message,
  });
  return null;
}

/**
 * Generate a job from any live invoice (paid or not; void/refunded blocked).
 * Atomic inside generate_job (creates the job, one work unit, a checklist
 * seeded from invoice line items, and a "created" event). Owner/admin only.
 */
export async function generateJob(invoiceId: string): Promise<GenerateResult> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can generate jobs." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_job", { p_invoice_id: invoiceId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/jobs");
  revalidatePath("/production");
  return { ok: true, jobId: data as string };
}

/** Change a work unit's production status and roll it up to the parent job. */
export async function setWorkUnitStatus(unitId: string, status: string): Promise<Result> {
  if (!workUnitStatuses.includes(status as WorkUnitStatus)) {
    return { ok: false, error: "Invalid status" };
  }

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!PRODUCTION_ROLES.has(ctx.role)) {
    return { ok: false, error: "You don't have permission to change job status." };
  }

  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("job_work_units")
    .select("id, job_id, name, status")
    .eq("id", unitId)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<{ id: string; job_id: string; name: string; status: string }>();
  if (!unit) return { ok: false, error: "Work unit not found." };
  if (unit.status === status) return { ok: true };

  const err = await applyUnitStatusChange(
    supabase,
    ctx.orgId,
    ctx.userId,
    unit,
    status,
    `${unit.name}: ${unit.status} → ${status}`,
  );
  if (err) return { ok: false, error: err };

  revalidatePath("/production");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${unit.job_id}`);
  return { ok: true };
}

/** Check/uncheck a checklist item within a work unit. */
export async function toggleChecklistItem(
  unitId: string,
  itemId: string,
  done: boolean,
): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!PRODUCTION_ROLES.has(ctx.role)) {
    return { ok: false, error: "You don't have permission to update the checklist." };
  }

  const supabase = await createClient();
  const { data: unit } = await supabase
    .from("job_work_units")
    .select("job_id, name, status, checklist")
    .eq("id", unitId)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<{
      job_id: string;
      name: string;
      status: string;
      checklist: JobChecklistItem[] | null;
    }>();
  if (!unit) return { ok: false, error: "Work unit not found." };

  const checklist = (unit.checklist ?? []).map((item) =>
    item.id === itemId ? { ...item, done } : item,
  );
  const { error } = await supabase
    .from("job_work_units")
    .update({ checklist })
    .eq("id", unitId)
    .eq("tenant_id", ctx.orgId);
  if (error) return { ok: false, error: error.message };

  // Auto-advance from the checklist (forward only): start work when the first
  // item is checked, mark ready once everything is done. Never auto-downgrades.
  const total = checklist.length;
  const doneCount = checklist.filter((c) => c.done).length;
  let auto: string | null = null;
  if (total > 0 && doneCount === total && unit.status !== "ready" && unit.status !== "cancelled") {
    auto = "ready";
  } else if (doneCount > 0 && unit.status === "scheduled") {
    auto = "in_production";
  }
  if (auto) {
    await applyUnitStatusChange(
      supabase,
      ctx.orgId,
      ctx.userId,
      { id: unitId, job_id: unit.job_id, name: unit.name, status: unit.status },
      auto,
      `${unit.name}: auto-advanced to ${auto.replace("_", " ")} (checklist)`,
    );
  }

  revalidatePath("/production");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${unit.job_id}`);
  return { ok: true };
}

/**
 * Generate the job's packing slip: creates its `packing_slips` row (all
 * options empty = defaults) and logs it. Idempotent — a job that already has a
 * slip keeps it. The PDF renders on demand from the invoice snapshot.
 * Production roles can do this, since they're the ones packing the boxes.
 */
export async function generatePackingSlip(jobId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, error: "Invalid job" };

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!PRODUCTION_ROLES.has(ctx.role)) {
    return { ok: false, error: "You don't have permission to generate packing slips." };
  }

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("invoice_id")
    .eq("id", jobId)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<{ invoice_id: string }>();
  if (!job) return { ok: false, error: "Job not found." };

  const { error } = await supabase.from("packing_slips").insert({
    tenant_id: ctx.orgId,
    job_id: jobId,
    invoice_id: job.invoice_id,
    created_by: ctx.userId,
  });
  // 23505 = the job already has a slip (unique job_id) — nothing to do.
  if (error?.code === "23505") return { ok: true };
  if (error) return { ok: false, error: error.message };

  await supabase.from("job_events").insert({
    tenant_id: ctx.orgId,
    job_id: jobId,
    actor_id: ctx.userId,
    type: "packing_slip",
    message: "Packing slip generated",
  });

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Mark a job delivered (only once every unit has reached "ready"). */
export async function markJobDelivered(jobId: string): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!PRODUCTION_ROLES.has(ctx.role)) {
    return { ok: false, error: "You don't have permission to deliver jobs." };
  }

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("status, invoice_number, customer_name")
    .eq("id", jobId)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<{ status: string; invoice_number: string | null; customer_name: string | null }>();
  if (!job) return { ok: false, error: "Job not found." };
  if (job.status !== "ready") {
    return { ok: false, error: "All work units must be ready before delivering." };
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "delivered" })
    .eq("id", jobId)
    .eq("tenant_id", ctx.orgId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("job_events").insert({
    tenant_id: ctx.orgId,
    job_id: jobId,
    actor_id: ctx.userId,
    type: "status_change",
    message: "Job delivered",
  });

  const jobLabel = job.invoice_number || "Job";
  await notifyOrg(supabase, {
    tenantId: ctx.orgId,
    type: "job_delivered",
    title: `${jobLabel} delivered`,
    body: job.customer_name
      ? `${job.customer_name}'s order is complete and delivered.`
      : "The order is complete and delivered.",
    entityType: "job",
    entityId: jobId,
  });

  revalidatePath("/production");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Debug-only: permanently delete a job (cascades work units + events). */
export async function deleteJob(jobId: string): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId).eq("tenant_id", ctx.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/jobs");
  revalidatePath("/production");
  return { ok: true };
}

const reorganizeSchema = z.object({
  jobId: z.string().uuid(),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1, "Name every section").max(80),
        method: z.string().trim().max(80),
        itemIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1, "Keep at least one section"),
});
export type ReorganizeSection = z.input<typeof reorganizeSchema>["sections"][number];

/**
 * Repartition a job's checklist items across work units in one pass. Each
 * section becomes a unit: an existing one (id matches a current unit) is updated
 * in place — keeping its status — and a new one starts "scheduled". Units no
 * longer present are deleted. Items keep their done state (we rebuild each
 * unit's checklist from the originals, so nothing is lost).
 */
export async function reorganizeWorkUnits(
  jobId: string,
  sections: ReorganizeSection[],
): Promise<Result> {
  const parsed = reorganizeSchema.safeParse({ jobId, sections });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid layout" };
  }
  const data = parsed.data;

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!PRODUCTION_ROLES.has(ctx.role)) {
    return { ok: false, error: "You don't have permission to organize work units." };
  }

  const supabase = await createClient();
  const { data: unitRows } = await supabase
    .from("job_work_units")
    .select("id, status, checklist")
    .eq("job_id", data.jobId)
    .eq("tenant_id", ctx.orgId);
  if (!unitRows || unitRows.length === 0) return { ok: false, error: "Job not found." };

  const rows = unitRows as { id: string; status: string; checklist: JobChecklistItem[] | null }[];
  const itemMap = new Map<string, JobChecklistItem>();
  for (const u of rows) {
    for (const c of u.checklist ?? []) itemMap.set(c.id, c);
  }
  const existingIds = new Set(rows.map((u) => u.id));

  // No item may be dropped, invented, or land in two sections.
  const assigned = new Set<string>();
  for (const s of data.sections) {
    for (const id of s.itemIds) {
      if (!itemMap.has(id)) return { ok: false, error: "Unknown item in a section." };
      if (assigned.has(id)) return { ok: false, error: "An item is in two sections." };
      assigned.add(id);
    }
  }
  if (assigned.size !== itemMap.size) {
    return { ok: false, error: "Every item must be placed in a section." };
  }

  const now = new Date().toISOString();
  const keep = new Set<string>();
  for (let i = 0; i < data.sections.length; i++) {
    const s = data.sections[i];
    if (!s) continue;
    const checklist = s.itemIds.map((id) => itemMap.get(id) as JobChecklistItem);
    const method = s.method.trim() || null;
    if (existingIds.has(s.id)) {
      keep.add(s.id);
      const { error } = await supabase
        .from("job_work_units")
        .update({ name: s.name, method, checklist, sort_order: i + 1 })
        .eq("id", s.id)
        .eq("tenant_id", ctx.orgId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("job_work_units").insert({
        tenant_id: ctx.orgId,
        job_id: data.jobId,
        name: s.name,
        method,
        status: "scheduled",
        checklist,
        sort_order: i + 1,
        status_changed_at: now,
      });
      if (error) return { ok: false, error: error.message };
    }
  }

  const toDelete = rows.filter((u) => !keep.has(u.id)).map((u) => u.id);
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("job_work_units")
      .delete()
      .in("id", toDelete)
      .eq("tenant_id", ctx.orgId);
    if (error) return { ok: false, error: error.message };
  }

  // Re-roll the job's status from the resulting units.
  const { data: units } = await supabase
    .from("job_work_units")
    .select("status")
    .eq("job_id", data.jobId)
    .eq("tenant_id", ctx.orgId);
  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", data.jobId)
    .maybeSingle<{ status: string }>();
  if (job && job.status !== "delivered" && job.status !== "cancelled") {
    const rolled = rollupJobStatus((units ?? []).map((u) => u.status as string));
    if (rolled !== job.status) {
      await supabase.from("jobs").update({ status: rolled }).eq("id", data.jobId);
    }
  }

  await supabase.from("job_events").insert({
    tenant_id: ctx.orgId,
    job_id: data.jobId,
    actor_id: ctx.userId,
    type: "reorganized",
    message: `Reorganized into ${data.sections.length} work unit${data.sections.length === 1 ? "" : "s"}`,
  });

  revalidatePath("/production");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${data.jobId}`);
  return { ok: true };
}
