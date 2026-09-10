import { Briefcase, FileText, Plus, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { PipelineChart, type PipelineStage } from "@/components/dashboard/pipeline-chart";
import { RangeSelect } from "@/components/dashboard/range-select";
import { type ActivityItem, RecentActivity } from "@/components/dashboard/recent-activity";
import { RevenueChart, type RevenuePoint } from "@/components/dashboard/revenue-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getActiveOrgId } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const RANGES = {
  "1m": { label: "Last month" },
  "3m": { label: "Last 3 months" },
  "6m": { label: "Last 6 months" },
  ytd: { label: "Year to date" },
  "1y": { label: "Last 12 months" },
  all: { label: "All time" },
} as const;
type RangeKey = keyof typeof RANGES;
const DEFAULT_RANGE: RangeKey = "ytd";
const RANGE_OPTIONS = (Object.keys(RANGES) as RangeKey[]).map((k) => ({
  value: k,
  label: RANGES[k].label,
}));

/** Even "all time" needs a ceiling — past this the bars get unreadable. */
const MAX_BUCKETS = 24;

/** Month buckets to chart. Null means "derive it from the data" (all time). */
function monthsForRange(key: RangeKey, now: Date): number | null {
  switch (key) {
    case "1m":
      return 1;
    case "3m":
      return 3;
    case "6m":
      return 6;
    case "ytd":
      return now.getMonth() + 1;
    case "1y":
      return 12;
    case "all":
      return null;
  }
}

type Logo = { logo_url: string | null };
type JobEmbed = { jobs: { status: string } | { status: string }[] | null };
type QuoteRow = {
  id: string;
  quote_number: string;
  status: string;
  total: string | number | null;
  created_at: string;
  customer_company: string | null;
  customer_name: string | null;
  customers: Logo | Logo[] | null;
  // Used to tell an approved quote that hasn't started production from one
  // that's already been produced/delivered.
  invoices: JobEmbed | JobEmbed[] | null;
};
type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  total: string | number | null;
  amount_due: string | number | null;
  created_at: string;
  customer_company: string | null;
  customer_name: string | null;
  customers: Logo | Logo[] | null;
};
type JobRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  created_at: string;
  customer_name: string | null;
  customers: { company: string | null; logo_url: string | null } | null;
};
type PaymentInvoice = {
  id: string;
  invoice_number: string;
  customer_company: string | null;
  customer_name: string | null;
  customers: Logo | Logo[] | null;
};
type PaymentRow = {
  id: string;
  amount: string | number | null;
  paid_on: string;
  created_at: string;
  invoices: PaymentInvoice | PaymentInvoice[] | null;
};

/** Supabase returns a to-one embed as an object or a single-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
function arr<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Parse YYYY-MM-DD by parts so it doesn't shift a day in a negative timezone. */
function parseYmd(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const OPEN_QUOTE_STATUSES = new Set(["sent", "viewed", "revised"]);
const DEAD_INVOICE_STATUSES = new Set(["paid", "void", "refunded"]);
const DONE_JOB_STATUSES = new Set(["delivered", "cancelled"]);

/** An approved quote counts as "ready to produce" only until a job exists for
 *  it — after that it's represented by the job's own stage instead. */
function hasJob(q: QuoteRow): boolean {
  return arr(q.invoices).some((inv) => arr(inv.jobs).length > 0);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const rangeKey: RangeKey = range && range in RANGES ? (range as RangeKey) : DEFAULT_RANGE;
  const rangeLabel = RANGES[rangeKey].label;

  const supabase = await createClient();
  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/onboarding");

  const now = new Date();
  const fixedMonths = monthsForRange(rangeKey, now);
  // Null window = all time (no lower bound on the queries).
  const windowStart =
    fixedMonths === null
      ? null
      : ymd(new Date(now.getFullYear(), now.getMonth() - (fixedMonths - 1), 1));

  let paymentQuery = supabase
    .from("invoice_payments")
    .select(
      "id, amount, paid_on, created_at, invoices(id, invoice_number, customer_company, customer_name, customers(logo_url))",
    )
    .eq("tenant_id", orgId)
    .order("paid_on", { ascending: false });
  if (windowStart) paymentQuery = paymentQuery.gte("paid_on", windowStart);

  const [{ data: paymentData }, { data: quoteData }, { data: invoiceData }, { data: jobData }] =
    await Promise.all([
      paymentQuery,
      supabase
        .from("quotes")
        .select(
          "id, quote_number, status, total, created_at, customer_company, customer_name, customers(logo_url), invoices(jobs(status))",
        )
        .eq("tenant_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, total, amount_due, created_at, customer_company, customer_name, customers(logo_url)",
        )
        .eq("tenant_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("jobs")
        .select(
          "id, invoice_number, status, created_at, customer_name, customers(company, logo_url)",
        )
        .eq("tenant_id", orgId)
        .order("created_at", { ascending: false }),
    ]);

  const payments = (paymentData ?? []) as unknown as PaymentRow[];
  const quotes = (quoteData ?? []) as unknown as QuoteRow[];
  const invoices = (invoiceData ?? []) as unknown as InvoiceRow[];
  const jobs = (jobData ?? []) as unknown as JobRow[];

  // ── Headline stats ──────────────────────────────────────────────────
  // Payments are already limited to the window by the query.
  const revenue = payments.reduce((s, p) => s + num(p.amount), 0);
  const openQuotes = quotes.filter((q) => OPEN_QUOTE_STATUSES.has(q.status));
  const activeJobs = jobs.filter((j) => !DONE_JOB_STATUSES.has(j.status));
  const liveInvoices = invoices.filter((i) => !DEAD_INVOICE_STATUSES.has(i.status));
  const outstandingAr = liveInvoices.reduce((s, i) => s + num(i.amount_due), 0);
  const unpaidCount = liveInvoices.filter((i) => num(i.amount_due) > 0).length;

  // ── Revenue by month across the window ──────────────────────────────
  // For "all time" the span comes from the earliest payment, capped so the
  // chart stays readable.
  let months = fixedMonths ?? 1;
  if (fixedMonths === null) {
    let earliest: string | null = null;
    for (const p of payments) {
      if (earliest === null || p.paid_on < earliest) earliest = p.paid_on;
    }
    if (earliest) {
      const d = parseYmd(earliest);
      const span = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + 1;
      months = Math.min(Math.max(span, 1), MAX_BUCKETS);
    }
  }

  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
  }
  for (const p of payments) {
    const d = parseYmd(p.paid_on);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + num(p.amount));
  }
  const revenueSeries: RevenuePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenueSeries.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      value: buckets.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0,
    });
  }

  // ── Pipeline — every order counted in exactly ONE stage ─────────────
  // An approved quote drops out of "Ready to produce" once its job exists, so
  // the stages never double-count the same order.
  const stages: PipelineStage[] = [
    { label: "Draft", count: quotes.filter((q) => q.status === "draft").length },
    { label: "Awaiting decision", count: openQuotes.length },
    {
      label: "Ready to produce",
      count: quotes.filter((q) => q.status === "approved" && !hasJob(q)).length,
    },
    { label: "In production", count: activeJobs.length },
    {
      label: "Delivered",
      count: jobs.filter(
        (j) => j.status === "delivered" && (windowStart === null || j.created_at >= windowStart),
      ).length,
    },
  ];

  const periodLabel = rangeLabel.toLowerCase();
  const chartSubtitle =
    fixedMonths === null && months >= MAX_BUCKETS
      ? `Payments received, last ${MAX_BUCKETS} months`
      : `Payments received, ${periodLabel}`;
  const pipelineSubtitle =
    rangeKey === "all" ? "Open work · all deliveries" : `Open work · delivered ${periodLabel}`;

  // ── Recent activity (merged across the whole lifecycle) ─────────────
  const activity: ActivityItem[] = [
    ...quotes.slice(0, 12).map<ActivityItem>((q) => ({
      id: q.id,
      kind: "quote",
      title: `Quote ${q.quote_number} created`,
      customer: q.customer_company || q.customer_name || "—",
      logoUrl: one(q.customers)?.logo_url ?? null,
      amount: num(q.total),
      date: q.created_at,
      href: `/quotes/${q.id}`,
    })),
    ...invoices.slice(0, 12).map<ActivityItem>((i) => ({
      id: i.id,
      kind: "invoice",
      title: `Invoice ${i.invoice_number} issued`,
      customer: i.customer_company || i.customer_name || "—",
      logoUrl: one(i.customers)?.logo_url ?? null,
      amount: num(i.total),
      date: i.created_at,
      href: `/invoices/${i.id}`,
    })),
    ...payments.slice(0, 12).map<ActivityItem>((p) => {
      const inv = one(p.invoices);
      return {
        id: p.id,
        kind: "payment",
        title: inv ? `Payment on ${inv.invoice_number}` : "Payment recorded",
        customer: inv?.customer_company || inv?.customer_name || "—",
        logoUrl: one(inv?.customers)?.logo_url ?? null,
        amount: num(p.amount),
        date: p.created_at,
        href: inv ? `/invoices/${inv.id}` : "/invoices",
      };
    }),
    ...jobs.slice(0, 12).map<ActivityItem>((j) => ({
      id: j.id,
      kind: "job",
      title:
        j.status === "delivered"
          ? `${j.invoice_number ?? "Job"} delivered`
          : `${j.invoice_number ?? "Job"} in production`,
      customer: j.customers?.company || j.customer_name || "—",
      logoUrl: j.customers?.logo_url ?? null,
      amount: null,
      date: j.created_at,
      href: `/jobs/${j.id}`,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back — here's what's happening in your shop."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RangeSelect value={rangeKey} defaultValue={DEFAULT_RANGE} options={RANGE_OPTIONS} />
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/quotes/new">
                <Plus className="size-4" /> New quote
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatCurrency(revenue)}
          hint={rangeLabel}
          icon={TrendingUp}
        />
        <StatCard
          label="Open quotes"
          value={String(openQuotes.length)}
          hint="Awaiting decision"
          icon={FileText}
        />
        <StatCard
          label="Jobs in production"
          value={String(activeJobs.length)}
          hint="Active orders"
          icon={Briefcase}
        />
        <StatCard
          label="Outstanding AR"
          value={formatCurrency(outstandingAr)}
          hint={`${unpaidCount} unpaid ${unpaidCount === 1 ? "invoice" : "invoices"}`}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <RevenueChart data={revenueSeries} subtitle={chartSubtitle} />
        </Card>
        <Card className="p-5">
          <PipelineChart stages={stages} subtitle={pipelineSubtitle} />
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-sm font-medium">Recent activity</h3>
            <p className="text-xs text-muted-foreground">
              The latest across quotes, invoices, payments, and jobs
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/quotes">View all</Link>
          </Button>
        </div>
        <RecentActivity items={activity} />
      </Card>
    </>
  );
}
