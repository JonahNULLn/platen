import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";

import { getActiveContext } from "@/lib/auth/session";
import { QuotePdfDocument } from "@/lib/pdf/quote-pdf";
import { type PdfOrg, pdfInvoiceFromDb } from "@/lib/pdf/snapshot";
import { createClient } from "@/lib/supabase/server";

// Guardrail: each invoice renders its own PDF in-process, so a huge batch would
// tie up the request. Cap it; the UI warns above this.
// TODO: move batch PDF rendering to a background job/queue when volumes grow.
const MAX_BATCH = 200;

type OrgRow = {
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  logo_wide_url: string | null;
  logo_url: string | null;
};

const INVOICE_COLUMNS =
  "id, tenant_id, invoice_number, status, issue_date, customer_name, customer_company, customer_email, customer_phone, customer_address_line1, customer_address_line2, customer_city, customer_state, customer_postal_code, customer_country, bill_to_same_as_shipping, bill_to_line1, bill_to_line2, bill_to_city, bill_to_state, bill_to_postal_code, bill_to_country, bill_to_email, purchase_order, approved_by_name, subtotal, discount_amount, tax_rate, tax_amount, is_tax_exempt, shipping_amount, shipping_mode, shipping_cap, shipping_actual, tracking_number, shipping_carrier, total, deposit_amount, amount_paid, amount_due, payment_method_default, payment_terms, terms, notes, invoice_line_items(name, description, quantity, unit_price, total_price, color_name, sort_order, sizes_breakdown, placements_data)";

export async function POST(req: Request) {
  const ctx = await getActiveContext();
  if (!ctx) return new Response("No active organization", { status: 401 });

  let ids: unknown;
  try {
    ({ ids } = (await req.json()) as { ids?: unknown });
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return new Response("No invoices selected", { status: 400 });
  }
  const idList = ids.filter((v): v is string => typeof v === "string").slice(0, MAX_BATCH);
  if (idList.length === 0) return new Response("No invoices selected", { status: 400 });

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, email, phone, address_line1, address_line2, city, state, postal_code, country, logo_wide_url, logo_url",
    )
    .eq("id", ctx.orgId)
    .maybeSingle<OrgRow>();
  if (!org) return new Response("Org not found", { status: 404 });

  const orgInfo: PdfOrg = {
    name: org.name,
    email: org.email,
    phone: org.phone,
    addressLine1: org.address_line1,
    addressLine2: org.address_line2,
    city: org.city,
    state: org.state,
    postalCode: org.postal_code,
    country: org.country,
    logoWideUrl: org.logo_wide_url,
    logoUrl: org.logo_url,
  };

  // Tenant-scoped fetch (RLS also enforces this) so a caller can never export
  // another org's invoices by guessing IDs.
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("tenant_id", ctx.orgId)
    .in("id", idList);
  if (error) return new Response(error.message, { status: 500 });
  if (!invoices || invoices.length === 0) {
    return new Response("No invoices found", { status: 404 });
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const inv of invoices) {
    const row = inv as unknown as Parameters<typeof pdfInvoiceFromDb>[0] & {
      invoice_line_items: Parameters<typeof pdfInvoiceFromDb>[1] | null;
    };
    const pdfInvoice = pdfInvoiceFromDb(row, row.invoice_line_items ?? [], orgInfo);
    const buffer = await renderToBuffer(<QuotePdfDocument quote={pdfInvoice} />);
    // Keep filenames unique if two invoices somehow share a number.
    let name = `${pdfInvoice.number || "invoice"}.pdf`;
    let n = 2;
    while (usedNames.has(name)) name = `${pdfInvoice.number}-${n++}.pdf`;
    usedNames.add(name);
    zip.file(name, buffer);
  }

  const content = await zip.generateAsync({ type: "nodebuffer" });

  return new Response(content as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="invoices.zip"',
      "Cache-Control": "no-store",
    },
  });
}
