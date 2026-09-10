"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrgId } from "@/lib/auth/session";
import { notifyOrg } from "@/lib/notifications/notify";
import { computeLineTotals, computeQuoteTotals } from "@/lib/quotes/totals";
import { type VariantMatrix, compareSizes } from "@/lib/quotes/types";
import { type QuoteInput, type QuoteLineItemInput, quoteInputSchema } from "@/lib/schemas/quote";
import { createClient } from "@/lib/supabase/server";

type SaveResult = { ok: true; id: string } | { ok: false; error: string };
type MutateResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Lazy-load a tenant product's distributor variants for the quote builder,
 * grouped by color (sizes size-ordered). Returns empty colors for custom
 * products (no distributor link) so the editor falls back to manual entry.
 */
export async function getProductVariantMatrix(tenantProductId: string): Promise<VariantMatrix> {
  const empty: VariantMatrix = { colors: [], sizesByColor: {} };
  if (typeof tenantProductId !== "string" || tenantProductId.length === 0) return empty;

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("tenant_products")
    .select("distributor_product_id")
    .eq("id", tenantProductId)
    .maybeSingle<{ distributor_product_id: string | null }>();
  if (!product?.distributor_product_id) return empty;

  const { data: variants } = await supabase
    .from("distributor_product_variants")
    .select("color_name, size_label, wholesale_price")
    .eq("distributor_product_id", product.distributor_product_id);
  if (!variants) return empty;

  const sizesByColor: Record<string, { size: string; cost: number | null }[]> = {};
  for (const v of variants as {
    color_name: string;
    size_label: string;
    wholesale_price: string | number | null;
  }[]) {
    const cost = v.wholesale_price === null ? null : Number(v.wholesale_price);
    let list = sizesByColor[v.color_name];
    if (!list) {
      list = [];
      sizesByColor[v.color_name] = list;
    }
    list.push({ size: v.size_label, cost });
  }
  for (const color of Object.keys(sizesByColor)) {
    sizesByColor[color]?.sort((a, b) => compareSizes(a.size, b.size));
  }
  const colors = Object.keys(sizesByColor).sort((a, b) => a.localeCompare(b));
  return { colors, sizesByColor };
}

const money = (n: number) => n.toFixed(2);

// biome-ignore lint/suspicious/noExplicitAny: Supabase server client is untyped here
type DB = any;

function lineCalc(item: QuoteLineItemInput) {
  return {
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitCost: item.unitCost,
    sizesBreakdown: item.sizesBreakdown,
    placementsData: item.placementsData,
  };
}

function quoteFields(input: QuoteInput) {
  const totals = computeQuoteTotals(input.lineItems.map(lineCalc), {
    discountType: input.discountType,
    discountValue: input.discountValue,
    depositType: input.depositType,
    depositValue: input.depositValue,
    shippingAmount: input.shippingAmount,
    taxRate: input.taxRate,
    isTaxExempt: input.isTaxExempt,
  });

  return {
    customer_id: input.customerId,
    customer_name: input.customerName,
    customer_company: input.customerCompany,
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone,
    customer_address_line1: input.customerAddressLine1,
    customer_address_line2: input.customerAddressLine2,
    customer_city: input.customerCity,
    customer_state: input.customerState,
    customer_postal_code: input.customerPostalCode,
    customer_country: input.customerCountry,
    bill_to_same_as_shipping: input.billToSameAsShipping,
    bill_to_line1: input.billToLine1,
    bill_to_line2: input.billToLine2,
    bill_to_city: input.billToCity,
    bill_to_state: input.billToState,
    bill_to_postal_code: input.billToPostalCode,
    bill_to_country: input.billToCountry,
    bill_to_email: input.billToEmail,
    customer_tax_exempt_id: input.customerTaxExemptId,
    quote_date: input.quoteDate,
    expires_at: input.expiresAt,
    purchase_order: input.purchaseOrder,
    is_tax_exempt: input.isTaxExempt,
    tax_rate: input.taxRate.toFixed(4),
    subtotal: money(totals.subtotal),
    tax_amount: money(totals.taxAmount),
    shipping_amount: money(totals.shippingAmount),
    shipping_mode: input.shippingMode,
    discount_type: input.discountType,
    discount_value: money(input.discountValue),
    discount_amount: money(totals.discountAmount),
    deposit_type: input.depositType,
    deposit_value: money(input.depositValue),
    deposit_amount: money(totals.depositAmount),
    total: money(totals.total),
    cost: money(totals.cost),
    profit: money(totals.profit),
    notes: input.notes,
    internal_notes: input.internalNotes,
    terms: input.terms,
    payment_terms: input.paymentTerms,
    payment_method_default: input.paymentMethodDefault,
    payment_schedule: input.paymentSchedule,
  };
}

async function insertLineItems(
  supabase: DB,
  tenantId: string,
  quoteId: string,
  items: QuoteLineItemInput[],
): Promise<string | null> {
  if (items.length === 0) return null;
  const rows = items.map((item, i) => {
    const t = computeLineTotals(lineCalc(item));
    return {
      tenant_id: tenantId,
      quote_id: quoteId,
      tenant_product_id: item.tenantProductId,
      item_type: item.itemType,
      name: item.name,
      description: item.description,
      quantity: t.quantity,
      unit_price: money(item.unitPrice),
      unit_cost: item.unitCost === null ? null : money(item.unitCost),
      total_price: money(t.totalPrice),
      total_cost: money(t.totalCost),
      sort_order: i + 1,
      sizes_breakdown: item.sizesBreakdown,
      placements_data: item.placementsData,
      color_name: item.colorName,
      notes: item.notes,
    };
  });
  const { error } = await supabase.from("quote_line_items").insert(rows);
  return error?.message ?? null;
}

/** Create (quoteId null) or update a quote. `send` flips status to "sent". */
export async function saveQuote(
  quoteId: string | null,
  input: QuoteInput,
  opts?: { send?: boolean },
): Promise<SaveResult> {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid quote" };
  }
  const data = parsed.data;

  const orgId = await getActiveOrgId();
  if (!orgId) return { ok: false, error: "No active organization" };

  const supabase = await createClient();
  const fields = quoteFields(data);

  if (quoteId) {
    const update = opts?.send ? { ...fields, status: "sent" } : fields;
    const { error } = await supabase.from("quotes").update(update).eq("id", quoteId);
    if (error) return { ok: false, error: error.message };

    const { error: deleteError } = await supabase
      .from("quote_line_items")
      .delete()
      .eq("quote_id", quoteId);
    if (deleteError) return { ok: false, error: deleteError.message };

    const liError = await insertLineItems(supabase, orgId, quoteId, data.lineItems);
    if (liError) return { ok: false, error: liError };

    // The PO is shared with the generated invoice — write it through so the two
    // documents never disagree. Best-effort: a failure here must not fail the save.
    await supabase
      .from("invoices")
      .update({ purchase_order: data.purchaseOrder })
      .eq("quote_id", quoteId)
      .eq("tenant_id", orgId);

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quoteId}`);
    revalidatePath("/invoices");
    return { ok: true, id: quoteId };
  }

  const { data: quoteNumber, error: numberError } = await supabase.rpc("allocate_quote_number", {
    p_tenant_id: orgId,
  });
  if (numberError) return { ok: false, error: numberError.message };

  const { data: created, error: insertError } = await supabase
    .from("quotes")
    .insert({
      tenant_id: orgId,
      quote_number: quoteNumber as string,
      version: 1,
      status: opts?.send ? "sent" : "draft",
      ...fields,
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  const liError = await insertLineItems(supabase, orgId, created.id, data.lineItems);
  if (liError) return { ok: false, error: liError };

  revalidatePath("/quotes");
  return { ok: true, id: created.id };
}

export async function deleteQuote(quoteId: string): Promise<MutateResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/quotes");
  return { ok: true };
}

export async function approveQuote(quoteId: string, approvedByName: string): Promise<MutateResult> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("quotes")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by_name: approvedByName.trim() || null,
    })
    .eq("id", quoteId)
    .select("tenant_id, quote_number, customer_company, customer_name")
    .maybeSingle<QuoteNotifyRow>();
  if (error) return { ok: false, error: error.message };
  if (row) {
    const who = row.customer_company || row.customer_name || "A customer";
    await notifyOrg(supabase, {
      tenantId: row.tenant_id,
      type: "quote_approved",
      title: `Quote ${row.quote_number} approved`,
      body: `${who}'s quote was approved — you can generate an invoice now.`,
      entityType: "quote",
      entityId: quoteId,
    });
  }
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true };
}

type QuoteNotifyRow = {
  tenant_id: string;
  quote_number: string;
  customer_company: string | null;
  customer_name: string | null;
};

async function setStatus(quoteId: string, status: string): Promise<MutateResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true };
}

export async function sendQuote(quoteId: string): Promise<MutateResult> {
  return setStatus(quoteId, "sent");
}

export async function declineQuote(quoteId: string): Promise<MutateResult> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("quotes")
    .update({ status: "declined" })
    .eq("id", quoteId)
    .select("tenant_id, quote_number, customer_company, customer_name")
    .maybeSingle<QuoteNotifyRow>();
  if (error) return { ok: false, error: error.message };
  if (row) {
    const who = row.customer_company || row.customer_name || "A customer";
    await notifyOrg(supabase, {
      tenantId: row.tenant_id,
      type: "quote_declined",
      title: `Quote ${row.quote_number} declined`,
      body: `${who}'s quote was marked declined.`,
      entityType: "quote",
      entityId: quoteId,
    });
  }
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true };
}

/**
 * Revert a declined or approved quote back to "sent". Also clears the captured
 * approval fields so a future re-approve doesn't inherit stale signature data.
 */
export async function revertQuoteToSent(quoteId: string): Promise<MutateResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({
      status: "sent",
      approved_at: null,
      approved_by_name: null,
      approved_by_signature_data: null,
    })
    .eq("id", quoteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true };
}

const CLONE_COLUMNS = [
  "customer_id",
  "customer_name",
  "customer_company",
  "customer_email",
  "customer_phone",
  "customer_address_line1",
  "customer_address_line2",
  "customer_city",
  "customer_state",
  "customer_postal_code",
  "customer_country",
  "bill_to_same_as_shipping",
  "bill_to_line1",
  "bill_to_line2",
  "bill_to_city",
  "bill_to_state",
  "bill_to_postal_code",
  "bill_to_country",
  "bill_to_email",
  "customer_tax_exempt_id",
  "quote_date",
  "expires_at",
  "purchase_order",
  "subtotal",
  "tax_rate",
  "tax_amount",
  "is_tax_exempt",
  "shipping_amount",
  "shipping_mode",
  "discount_type",
  "discount_value",
  "discount_amount",
  "deposit_type",
  "deposit_value",
  "deposit_amount",
  "total",
  "cost",
  "profit",
  "notes",
  "internal_notes",
  "terms",
  "payment_terms",
  "payment_method_default",
  "payment_schedule",
].join(", ");

const LINE_ITEM_CLONE_COLUMNS =
  "tenant_product_id, item_type, name, description, quantity, unit_price, unit_cost, total_price, total_cost, sort_order, sizes_breakdown, placements_data, color_name, notes";

async function cloneQuote(
  quoteId: string,
  overrides: Record<string, unknown>,
): Promise<SaveResult> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { ok: false, error: "No active organization" };

  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("quotes")
    .select(CLONE_COLUMNS)
    .eq("id", quoteId)
    .maybeSingle<Record<string, unknown>>();
  if (sourceError) return { ok: false, error: sourceError.message };
  if (!source) return { ok: false, error: "Quote not found" };

  const { data: newQuote, error: insertError } = await supabase
    .from("quotes")
    .insert({ tenant_id: orgId, ...source, status: "draft", ...overrides })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  const { data: items, error: itemsError } = await supabase
    .from("quote_line_items")
    .select(LINE_ITEM_CLONE_COLUMNS)
    .eq("quote_id", quoteId);
  if (itemsError) return { ok: false, error: itemsError.message };

  if (items && items.length > 0) {
    const rows = items.map((item: Record<string, unknown>) => ({
      ...item,
      tenant_id: orgId,
      quote_id: newQuote.id,
    }));
    const { error: copyError } = await supabase.from("quote_line_items").insert(rows);
    if (copyError) return { ok: false, error: copyError.message };
  }

  revalidatePath("/quotes");
  return { ok: true, id: newQuote.id };
}

/** Independent copy: fresh number, version 1, no parent link. */
export async function duplicateQuote(quoteId: string): Promise<SaveResult> {
  const supabase = await createClient();
  const orgId = await getActiveOrgId();
  if (!orgId) return { ok: false, error: "No active organization" };

  const { data: quoteNumber, error: numberError } = await supabase.rpc("allocate_quote_number", {
    p_tenant_id: orgId,
  });
  if (numberError) return { ok: false, error: numberError.message };

  return cloneQuote(quoteId, {
    quote_number: quoteNumber as string,
    version: 1,
    parent_quote_id: null,
  });
}

/** Revision: same number, version+1, linked to the source; source → "revised". */
export async function createRevision(quoteId: string): Promise<SaveResult> {
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("quotes")
    .select("quote_number, version")
    .eq("id", quoteId)
    .maybeSingle<{ quote_number: string; version: number }>();
  if (sourceError) return { ok: false, error: sourceError.message };
  if (!source) return { ok: false, error: "Quote not found" };

  const result = await cloneQuote(quoteId, {
    quote_number: source.quote_number,
    version: source.version + 1,
    parent_quote_id: quoteId,
  });
  if (!result.ok) return result;

  await supabase.from("quotes").update({ status: "revised" }).eq("id", quoteId);
  revalidatePath(`/quotes/${quoteId}`);
  return result;
}
