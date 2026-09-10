import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { InvoiceHeaderActions } from "@/components/invoices/invoice-header-actions";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { type PaymentRow, PaymentsCard } from "@/components/invoices/payments-card";
import { PurchaseOrderCard } from "@/components/invoices/purchase-order-card";
import { ShippingCard } from "@/components/invoices/shipping-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveContext } from "@/lib/auth/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { type PaymentInstallment, scheduleWithDates } from "@/lib/payments/payment-terms";
import type { ShippingMode } from "@/lib/quotes/shipping";
import { isShippingCarrier, trackingUrl } from "@/lib/shipping/carriers";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  purchase_order: string | null;
  shipping_mode: string | null;
  shipping_cap: string | null;
  shipping_actual: string | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
  due_date: string | null;
  customer_name: string | null;
  customer_company: string | null;
  customer_email: string | null;
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  tax_amount: string;
  total: string;
  amount_paid: string;
  amount_due: string | null;
  payment_terms: string | null;
  payment_schedule: PaymentInstallment[] | null;
};

type LineItemRow = {
  id: string;
  name: string;
  description: string | null;
  color_name: string | null;
  quantity: number;
  unit_price: string;
  total_price: string;
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getActiveContext();
  if (!ctx) redirect("/onboarding");
  const canManage = ctx.role === "owner" || ctx.role === "admin";

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, issue_date, due_date, purchase_order, shipping_mode, shipping_cap, shipping_actual, tracking_number, shipping_carrier, customer_name, customer_company, customer_email, subtotal, discount_amount, shipping_amount, tax_amount, total, amount_paid, amount_due, payment_terms, payment_schedule",
    )
    .eq("id", id)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<InvoiceRow>();
  if (!invoice) notFound();

  const [{ data: lineItems }, { data: payments }, { data: job }] = await Promise.all([
    supabase
      .from("invoice_line_items")
      .select("id, name, description, color_name, quantity, unit_price, total_price")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("invoice_payments")
      .select("id, amount, method, reference, paid_on, notes")
      .eq("invoice_id", id)
      .order("paid_on", { ascending: false }),
    supabase.from("jobs").select("id").eq("invoice_id", id).maybeSingle<{ id: string }>(),
  ]);

  const items = (lineItems ?? []) as LineItemRow[];
  const paymentRows: PaymentRow[] = (
    (payments ?? []) as {
      id: string;
      amount: string;
      method: string | null;
      reference: string | null;
      paid_on: string;
      notes: string | null;
    }[]
  ).map((p) => ({
    id: p.id,
    amount: p.amount,
    method: p.method,
    reference: p.reference,
    paidOn: p.paid_on,
    notes: p.notes,
  }));

  const customer = invoice.customer_company || invoice.customer_name || "—";
  const discount = Number(invoice.discount_amount);
  const shipping = Number(invoice.shipping_amount);
  const tax = Number(invoice.tax_amount);

  // Payment schedule snapshot (carried from the quote) → progress against
  // payments recorded so far, with each installment's due date + overdue flag.
  const schedule = invoice.payment_schedule ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const {
    rows: scheduleRows,
    nextDue,
    anyOverdue,
  } = schedule.length > 0
    ? scheduleWithDates(
        schedule,
        Number(invoice.total),
        Number(invoice.amount_paid),
        invoice.issue_date,
        today,
      )
    : { rows: [], nextDue: null, anyOverdue: false };
  // Read-time status: a live invoice with a past-due unpaid installment reads
  // as "overdue" (never persisted — there's no scheduler to write it).
  const effectiveStatus =
    anyOverdue && (invoice.status === "pending" || invoice.status === "deposit_paid")
      ? "overdue"
      : invoice.status;

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href="/invoices">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
        </Button>
      </div>

      <PageHeader
        title={invoice.invoice_number}
        subtitle={
          <span className="flex items-center gap-2">
            {customer}
            <InvoiceStatusBadge status={effectiveStatus} />
          </span>
        }
        actions={
          <InvoiceHeaderActions
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoice_number}
            status={invoice.status}
            canManage={canManage}
            existingJobId={job?.id ?? null}
            trackingUrl={trackingUrl(invoice.shipping_carrier, invoice.tracking_number)}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell>
                        <div className="font-medium">{li.name}</div>
                        {li.color_name || li.description ? (
                          <div className="text-xs text-muted-foreground">
                            {[li.color_name, li.description].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{li.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(li.unit_price)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(li.total_price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Issued" value={formatDate(invoice.issue_date)} />
              {invoice.due_date ? <Row label="Due" value={formatDate(invoice.due_date)} /> : null}
              <div className="my-2 border-t border-border" />
              <Row label="Subtotal" value={formatCurrency(invoice.subtotal)} />
              {discount > 0 ? (
                <Row label="Discount" value={`−${formatCurrency(discount)}`} />
              ) : null}
              {shipping > 0 ? <Row label="Shipping" value={formatCurrency(shipping)} /> : null}
              {tax > 0 ? <Row label="Tax" value={formatCurrency(tax)} /> : null}
              <div className="flex items-center justify-between pt-1 font-semibold">
                <span>Total</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
              <Row label="Paid" value={formatCurrency(invoice.amount_paid)} />
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span>Amount due</span>
                <span>{formatCurrency(invoice.amount_due)}</span>
              </div>
            </CardContent>
          </Card>

          {scheduleRows.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Payment schedule</CardTitle>
                {invoice.payment_terms ? (
                  <CardDescription>{invoice.payment_terms}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {scheduleRows.map((r) => (
                  <div
                    key={r.id}
                    className={
                      r.state === "due"
                        ? "flex items-center justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-2"
                        : "flex items-center justify-between gap-3 px-2.5 py-1"
                    }
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{r.label || "Installment"}</div>
                      <div
                        className={cn(
                          "text-xs",
                          r.overdue ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {r.dueDate ? formatDate(r.dueDate) : r.dueLabel}
                        {r.overdue ? " · overdue" : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">{formatCurrency(r.amount)}</div>
                      <div className="text-xs">
                        {r.state === "paid" ? (
                          <span className="text-success">Paid</span>
                        ) : r.overdue ? (
                          <span className="font-medium text-destructive">
                            {formatCurrency(r.remaining)} overdue
                          </span>
                        ) : r.state === "due" ? (
                          <span className="font-medium text-foreground">
                            {formatCurrency(r.remaining)} due
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Upcoming</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <PaymentsCard
            invoiceId={invoice.id}
            amountDue={Number(invoice.amount_due ?? 0)}
            suggestedAmount={nextDue?.remaining}
            canManage={canManage}
            payments={paymentRows}
          />

          <PurchaseOrderCard
            invoiceId={invoice.id}
            value={invoice.purchase_order}
            canManage={canManage}
          />

          <ShippingCard
            invoiceId={invoice.id}
            mode={(invoice.shipping_mode ?? "standard") as ShippingMode}
            cap={invoice.shipping_cap === null ? null : Number(invoice.shipping_cap)}
            actual={invoice.shipping_actual === null ? null : Number(invoice.shipping_actual)}
            billed={shipping}
            tracking={invoice.tracking_number}
            carrier={
              isShippingCarrier(invoice.shipping_carrier) ? invoice.shipping_carrier : "other"
            }
            canManage={canManage}
          />
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
