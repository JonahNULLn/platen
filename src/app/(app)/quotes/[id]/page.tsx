import { notFound, redirect } from "next/navigation";

import { GenerateInvoiceButton } from "@/components/quotes/generate-invoice-button";
import { QuoteBuilder, type QuoteBuilderInitial } from "@/components/quotes/quote-builder";
import { QuoteStatusActions } from "@/components/quotes/quote-status-actions";
import { getActiveOrgId } from "@/lib/auth/session";
import type { PlacementEntry, SizeBreakdownEntry } from "@/lib/db/schema/quotes";
import type { PaymentInstallment } from "@/lib/payments/payment-terms";
import { addressesToSlice } from "@/lib/quotes/customer-address";
import { hydratePlacement } from "@/lib/quotes/placements";
import { getOrgPdfInfo, getQuoteRefData } from "@/lib/quotes/ref-data";
import type { ShippingMode } from "@/lib/quotes/shipping";
import { nextKey } from "@/lib/quotes/types";
import { createClient } from "@/lib/supabase/server";

type LineItemRow = {
  id: string;
  item_type: "product" | "custom" | "fee";
  tenant_product_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: string | number;
  unit_cost: string | number | null;
  total_price: string | number;
  color_name: string | null;
  notes: string | null;
  sort_order: number | null;
  sizes_breakdown: SizeBreakdownEntry[] | null;
  placements_data: PlacementEntry[] | null;
};

type QuoteRow = {
  id: string;
  quote_number: string;
  version: number;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_company: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address_line1: string | null;
  customer_address_line2: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_postal_code: string | null;
  customer_country: string | null;
  bill_to_same_as_shipping: boolean;
  bill_to_line1: string | null;
  bill_to_line2: string | null;
  bill_to_city: string | null;
  bill_to_state: string | null;
  bill_to_postal_code: string | null;
  bill_to_country: string | null;
  bill_to_email: string | null;
  customer_tax_exempt_id: string | null;
  quote_date: string;
  expires_at: string | null;
  purchase_order: string | null;
  approved_by_name: string | null;
  is_tax_exempt: boolean;
  tax_rate: string | number | null;
  shipping_amount: string | number;
  shipping_mode: string | null;
  discount_type: "amount" | "percent";
  discount_value: string | number;
  deposit_type: "amount" | "percent";
  deposit_value: string | number;
  notes: string | null;
  internal_notes: string | null;
  terms: string | null;
  payment_terms: string | null;
  payment_method_default: string | null;
  payment_schedule: PaymentInstallment[] | null;
  quote_line_items: LineItemRow[];
};

const str = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [refData, org, orgId] = await Promise.all([
    getQuoteRefData(),
    getOrgPdfInfo(),
    getActiveOrgId(),
  ]);
  if (!refData || !org || !orgId) redirect("/onboarding");

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, version, status, customer_id, customer_name, customer_company, customer_email, customer_phone, customer_address_line1, customer_address_line2, customer_city, customer_state, customer_postal_code, customer_country, bill_to_same_as_shipping, bill_to_line1, bill_to_line2, bill_to_city, bill_to_state, bill_to_postal_code, bill_to_country, bill_to_email, customer_tax_exempt_id, quote_date, expires_at, purchase_order, approved_by_name, is_tax_exempt, tax_rate, shipping_amount, shipping_mode, discount_type, discount_value, deposit_type, deposit_value, notes, internal_notes, terms, payment_terms, payment_method_default, payment_schedule, quote_line_items(id, item_type, tenant_product_id, name, description, quantity, unit_price, unit_cost, total_price, color_name, notes, sort_order, sizes_breakdown, placements_data)",
    )
    .eq("id", id)
    .eq("tenant_id", orgId)
    .maybeSingle<QuoteRow>();

  if (!quote) {
    notFound();
  }

  // Has this quote already been turned into an invoice? (1:1)
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("quote_id", quote.id)
    .maybeSingle<{ id: string }>();

  const initial: QuoteBuilderInitial = {
    customer: {
      customerId: quote.customer_id,
      name: quote.customer_name ?? "",
      company: quote.customer_company ?? "",
      email: quote.customer_email ?? "",
      phone: quote.customer_phone ?? "",
      ...addressesToSlice(quote),
      billToEmail: quote.bill_to_email ?? "",
      isTaxExempt: quote.is_tax_exempt,
      customerTaxExemptId: quote.customer_tax_exempt_id ?? "",
    },
    adjustments: {
      discountType: quote.discount_type,
      discountValue: str(quote.discount_value),
      shippingAmount: str(quote.shipping_amount),
      shippingMode: (quote.shipping_mode ?? "standard") as ShippingMode,
      depositType: quote.deposit_type,
      depositValue: str(quote.deposit_value),
      taxRate: Number(quote.tax_rate ?? 0),
      isTaxExempt: quote.is_tax_exempt,
    },
    meta: {
      quoteDate: quote.quote_date,
      expiresAt: quote.expires_at ?? "",
      purchaseOrder: quote.purchase_order ?? "",
      notes: quote.notes ?? "",
      internalNotes: quote.internal_notes ?? "",
      terms: quote.terms ?? "",
      paymentTerms: quote.payment_terms ?? "",
      // Older quotes predate the method being mandatory; the builder falls
      // back to its default rather than showing an empty select.
      paymentMethodDefault: quote.payment_method_default ?? "",
      paymentSchedule: quote.payment_schedule ?? null,
    },
    lines: [...quote.quote_line_items]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((li) => ({
        key: nextKey("line"),
        itemType: li.item_type,
        tenantProductId: li.tenant_product_id,
        name: li.name,
        description: li.description ?? "",
        colorName: li.color_name ?? "",
        notes: li.notes ?? "",
        unitPrice: str(li.unit_price),
        unitCost: li.unit_cost === null ? "" : str(li.unit_cost),
        quantity: String(li.quantity),
        sizes: (li.sizes_breakdown ?? []).map((s) => ({
          size: s.size,
          qty: String(s.qty),
          unitPrice: String(s.unitPrice),
          unitCost: s.unitCost === undefined || s.unitCost === null ? "" : String(s.unitCost),
          overridden: Boolean(s.overridden),
        })),
        // Relink to current placement settings and fill in ink cost for
        // quotes saved before it existed. The stored price is kept as-is.
        placements: (li.placements_data ?? []).map((p) => ({
          key: nextKey("p"),
          ...hydratePlacement(p, refData.placements),
          placementName: p.placementName,
          colorCount: String(p.colorCount),
          price: String(p.price),
        })),
      })),
  };

  return (
    <QuoteBuilder
      refData={refData}
      org={org}
      quoteId={quote.id}
      initial={initial}
      existing={{
        quoteNumber: quote.quote_number,
        version: quote.version,
        status: quote.status,
        approvedByName: quote.approved_by_name,
      }}
      detailActions={
        <div className="flex items-center gap-2">
          <GenerateInvoiceButton
            quoteId={quote.id}
            status={quote.status}
            existingInvoiceId={existingInvoice?.id ?? null}
          />
          <QuoteStatusActions
            quoteId={quote.id}
            quoteNumber={quote.quote_number}
            status={quote.status}
          />
        </div>
      }
    />
  );
}
