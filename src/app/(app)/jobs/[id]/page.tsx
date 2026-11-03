import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CustomerAvatar } from "@/components/common/customer-avatar";
import { DeliverJobButton } from "@/components/jobs/deliver-job-button";
import { JobStatusBadge } from "@/components/jobs/job-status";
import { PackingSlipButton } from "@/components/jobs/packing-slip-button";
import { type WorkUnit, WorkUnitCard } from "@/components/jobs/work-unit-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveContext } from "@/lib/auth/session";
import type { JobChecklistItem } from "@/lib/db/schema/jobs";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type JobRow = {
  id: string;
  customer_name: string | null;
  invoice_id: string;
  invoice_number: string | null;
  status: string;
  due_date: string | null;
  customers: { company: string | null; logo_url: string | null } | null;
};

type UnitRow = {
  id: string;
  name: string;
  method: string | null;
  status: string;
  checklist: JobChecklistItem[] | null;
};

type EventRow = {
  type: string;
  message: string;
  created_at: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

const PRODUCTION_ROLES = new Set(["owner", "admin", "production"]);

/**
 * Work-unit "part" number: the job number (= invoice number) plus a letter
 * suffix (A, B, C…) when the job has more than one unit, e.g. MPBI-0001A.
 */
function partNumber(job: { invoice_number: string | null }, index: number, total: number): string {
  const base = job.invoice_number ?? "";
  if (!base) return "";
  return total > 1 ? `${base}${String.fromCharCode(65 + index)}` : base;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getActiveContext();
  if (!ctx) redirect("/onboarding");
  const canEdit = PRODUCTION_ROLES.has(ctx.role);

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, customer_name, invoice_id, invoice_number, status, due_date, customers(company, logo_url)",
    )
    .eq("id", id)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<JobRow>();
  if (!job) notFound();

  const [{ data: unitRows }, { data: eventRows }, { data: packingSlip }] = await Promise.all([
    supabase
      .from("job_work_units")
      .select("id, name, method, status, checklist")
      .eq("job_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("job_events")
      .select("type, message, created_at, profiles(first_name, last_name)")
      .eq("job_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("packing_slips")
      .select("id")
      .eq("job_id", id)
      .eq("tenant_id", ctx.orgId)
      .maybeSingle<{ id: string }>(),
  ]);

  const units: WorkUnit[] = ((unitRows as UnitRow[] | null) ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    method: u.method,
    status: u.status,
    checklist: u.checklist ?? [],
  }));
  const events = (eventRows as unknown as EventRow[] | null) ?? [];
  // Prefer the live customer's company name + logo; fall back to the snapshot.
  const displayName = job.customers?.company || job.customer_name || "Job";
  const logoUrl = job.customers?.logo_url ?? null;

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href="/jobs">
            <ArrowLeft className="size-4" /> Jobs
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <CustomerAvatar name={displayName} logoUrl={logoUrl} size="lg" />
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName}</h1>
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {job.invoice_number ? `Invoice ${job.invoice_number}` : "Job"}
              <JobStatusBadge status={job.status} />
              {job.due_date ? <span>· due {formatDate(job.due_date)}</span> : null}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/invoices/${job.invoice_id}`}>
              <FileText className="size-3.5" /> Invoice
            </Link>
          </Button>
          <PackingSlipButton
            jobId={job.id}
            invoiceNumber={job.invoice_number ?? ""}
            generated={packingSlip !== null}
            canGenerate={canEdit}
          />
          {canEdit && job.status === "ready" ? <DeliverJobButton jobId={job.id} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {units.map((u, i) => (
            <WorkUnitCard
              key={u.id}
              unit={u}
              number={partNumber(job, i, units.length)}
              canEdit={canEdit}
              jobId={job.id}
              allUnits={units}
            />
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((e, i) => {
                  const who =
                    `${e.profiles?.first_name ?? ""} ${e.profiles?.last_name ?? ""}`.trim();
                  return (
                    <li key={`${e.created_at}-${i}`} className="text-sm">
                      <p>{e.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {who ? `${who} · ` : ""}
                        {formatDate(e.created_at)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
