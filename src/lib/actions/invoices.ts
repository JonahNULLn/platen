"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveContext } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format";
import { notifyOrg } from "@/lib/notifications/notify";
import { round2 } from "@/lib/quotes/totals";
import { shippingCarriers } from "@/lib/shipping/carriers";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
type GenerateResult = { ok: true; invoiceId: string } | { ok: false; error: string };

const MANAGE_ROLES = new Set(["owner", "admin"]);

const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  method: z.string().trim().min(1).max(40).optional(),
  reference: z.string().trim().max(120).optional(),
  paidOn: z.string().trim().min(1).optional(), // YYYY-MM-DD
  notes: z.string().trim().max(500).optional(),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

/**
 * Generate an invoice from an approved quote. The heavy lifting (snapshot of
 * line items + dedupe + tenant check) is atomic inside the generate_invoice RPC.
 * Owner/admin only.
 */
export async function generateInvoice(quoteId: string): Promise<GenerateResult> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can generate invoices." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_invoice", { p_quote_id: quoteId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/invoices");
  return { ok: true, invoiceId: data as string };
}

/**
 * Record a payment against an invoice. Inserting the row is enough — a DB
 * trigger recomputes the invoice's amount_paid and auto-advances its status
 * (pending → deposit_paid → paid). Owner/admin only.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<Result> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payment" };
  }
  const data = parsed.data;

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can record payments." };
  }

  const supabase = await createClient();

  // Confirm the invoice belongs to the active org before attaching a payment.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", data.invoiceId)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found." };

  const { error } = await supabase.from("invoice_payments").insert({
    tenant_id: ctx.orgId,
    invoice_id: data.invoiceId,
    amount: Number(data.amount.toFixed(2)),
    method: data.method ?? null,
    reference: data.reference ?? null,
    paid_on: data.paidOn ?? undefined,
    notes: data.notes ?? null,
    recorded_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };

  // The insert trigger has recomputed status — re-read it so the notification
  // reflects whether this payment settled the invoice in full.
  const { data: inv } = await supabase
    .from("invoices")
    .select("invoice_number, status, customer_company, customer_name")
    .eq("id", data.invoiceId)
    .maybeSingle<{
      invoice_number: string;
      status: string;
      customer_company: string | null;
      customer_name: string | null;
    }>();
  if (inv) {
    const who = inv.customer_company || inv.customer_name || "a customer";
    const amount = formatCurrency(Number(data.amount.toFixed(2)));
    const paidInFull = inv.status === "paid";
    await notifyOrg(supabase, {
      tenantId: ctx.orgId,
      type: paidInFull ? "invoice_paid" : "payment_recorded",
      title: paidInFull
        ? `Invoice ${inv.invoice_number} paid in full`
        : `Payment recorded on ${inv.invoice_number}`,
      body: paidInFull ? `${who}'s invoice is fully paid.` : `${amount} received from ${who}.`,
      entityType: "invoice",
      entityId: data.invoiceId,
    });
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${data.invoiceId}`);
  return { ok: true };
}

const purchaseOrderSchema = z.object({
  invoiceId: z.string().uuid(),
  purchaseOrder: z.string().trim().max(60),
});
export type SetPurchaseOrderInput = z.input<typeof purchaseOrderSchema>;

/**
 * Set the customer's PO number on an invoice, writing it through to the source
 * quote as well. The PO is one shared value across the pair, so editing it on
 * either document updates both. Owner/admin only.
 */
export async function setInvoicePurchaseOrder(input: SetPurchaseOrderInput): Promise<Result> {
  const parsed = purchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid purchase order" };
  }
  const { invoiceId, purchaseOrder } = parsed.data;
  const value = purchaseOrder === "" ? null : purchaseOrder;

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can change the purchase order." };
  }

  const supabase = await createClient();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({ purchase_order: value })
    .eq("id", invoiceId)
    .eq("tenant_id", ctx.orgId)
    .select("quote_id")
    .maybeSingle<{ quote_id: string | null }>();
  if (error) return { ok: false, error: error.message };
  if (!invoice) return { ok: false, error: "Invoice not found." };

  if (invoice.quote_id) {
    await supabase
      .from("quotes")
      .update({ purchase_order: value })
      .eq("id", invoice.quote_id)
      .eq("tenant_id", ctx.orgId);
    revalidatePath(`/quotes/${invoice.quote_id}`);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/quotes");
  return { ok: true };
}

const shippingSchema = z.object({
  invoiceId: z.string().uuid(),
  /** Empty string clears it — the invoice falls back to billing the cap. */
  shippingActual: z.string().trim(),
  trackingNumber: z.string().trim().max(120),
  shippingCarrier: z.enum(shippingCarriers),
});
export type SetShippingInput = z.input<typeof shippingSchema>;

/**
 * Record the real shipping cost and tracking number on an invoice quoted with a
 * capped estimate.
 *
 * Shipping feeds tax and the grand total, so this re-runs the same arithmetic
 * the quote builder uses (see lib/quotes/totals.ts) against the invoice's own
 * snapshot: tax applies to goods-after-discount plus shipping, and profit is
 * deliberately left alone because it never counted shipping. Because the total
 * moves, the paid/deposit/pending status is re-derived exactly the way the
 * invoice_payments trigger does — otherwise an invoice could sit on "paid"
 * while money is still owed.
 */
export async function setInvoiceShipping(input: SetShippingInput): Promise<Result> {
  const parsed = shippingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid shipping" };
  }
  const { invoiceId, shippingActual, trackingNumber, shippingCarrier } = parsed.data;

  let actual: number | null = null;
  if (shippingActual !== "") {
    const n = Number(shippingActual);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Enter a valid shipping amount." };
    actual = round2(n);
  }

  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can update shipping." };
  }

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "status, subtotal, discount_amount, tax_rate, is_tax_exempt, shipping_cap, shipping_amount, amount_paid",
    )
    .eq("id", invoiceId)
    .eq("tenant_id", ctx.orgId)
    .maybeSingle<{
      status: string;
      subtotal: string | number;
      discount_amount: string | number;
      tax_rate: string | number | null;
      is_tax_exempt: boolean;
      shipping_cap: string | number | null;
      shipping_amount: string | number;
      amount_paid: string | number;
    }>();
  if (!invoice) return { ok: false, error: "Invoice not found." };

  const n = (v: string | number | null | undefined) => {
    const parsedNum = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
    return Number.isFinite(parsedNum) ? parsedNum : 0;
  };

  // Clearing the actual falls back to the cap, so the invoice always bills
  // something defensible rather than dropping to zero.
  const cap = invoice.shipping_cap == null ? n(invoice.shipping_amount) : n(invoice.shipping_cap);
  const shipping = actual ?? cap;

  const taxableBase = round2(n(invoice.subtotal) - n(invoice.discount_amount));
  const taxRate = n(invoice.tax_rate);
  const taxAmount = invoice.is_tax_exempt ? 0 : round2((taxableBase + shipping) * taxRate);
  const total = round2(taxableBase + taxAmount + shipping);

  const paid = n(invoice.amount_paid);
  // void / refunded are terminal — a shipping correction must not revive them.
  const status =
    invoice.status === "void" || invoice.status === "refunded"
      ? invoice.status
      : paid <= 0
        ? "pending"
        : paid < total
          ? "deposit_paid"
          : "paid";

  const { error } = await supabase
    .from("invoices")
    .update({
      shipping_actual: actual === null ? null : actual.toFixed(2),
      tracking_number: trackingNumber === "" ? null : trackingNumber,
      shipping_carrier: shippingCarrier,
      shipping_amount: shipping.toFixed(2),
      tax_amount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      status,
    })
    .eq("id", invoiceId)
    .eq("tenant_id", ctx.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Delete a payment. The recalc trigger walks the invoice status back down. */
export async function deletePayment(paymentId: string, invoiceId: string): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can delete payments." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_payments")
    .delete()
    .eq("id", paymentId)
    .eq("tenant_id", ctx.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

/** Debug-only: permanently delete an invoice (cascades line items, payments,
 *  and any job generated from it). */
export async function deleteInvoice(invoiceId: string): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId)
    .eq("tenant_id", ctx.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath("/jobs");
  revalidatePath("/quotes");
  return { ok: true };
}

/** Void an invoice (keeps the record but stops it counting as owed). */
export async function voidInvoice(invoiceId: string): Promise<Result> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!MANAGE_ROLES.has(ctx.role)) {
    return { ok: false, error: "Only an owner or admin can void invoices." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId)
    .eq("tenant_id", ctx.orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}
