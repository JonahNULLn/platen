import { renderToStream } from "@react-pdf/renderer";

import { QuotePdfDocument } from "@/lib/pdf/quote-pdf";
import { type PdfOrg, pdfInvoiceFromDb } from "@/lib/pdf/snapshot";
import { createClient } from "@/lib/supabase/server";

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "tenant_id, invoice_number, status, issue_date, customer_name, customer_company, customer_email, customer_phone, customer_address_line1, customer_address_line2, customer_city, customer_state, customer_postal_code, customer_country, bill_to_same_as_shipping, bill_to_line1, bill_to_line2, bill_to_city, bill_to_state, bill_to_postal_code, bill_to_country, bill_to_email, purchase_order, approved_by_name, subtotal, discount_amount, tax_rate, tax_amount, is_tax_exempt, shipping_amount, shipping_mode, shipping_cap, shipping_actual, tracking_number, shipping_carrier, total, deposit_amount, amount_paid, amount_due, payment_method_default, payment_terms, terms, notes, invoice_line_items(name, description, quantity, unit_price, total_price, color_name, sort_order, sizes_breakdown, placements_data)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, email, phone, address_line1, address_line2, city, state, postal_code, country, logo_wide_url, logo_url",
    )
    .eq("id", (invoice as { tenant_id: string }).tenant_id)
    .maybeSingle<OrgRow>();

  if (!org) {
    return new Response("Org not found", { status: 404 });
  }

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

  const items = (
    invoice as unknown as { invoice_line_items: Parameters<typeof pdfInvoiceFromDb>[1] }
  ).invoice_line_items;
  const pdfInvoice = pdfInvoiceFromDb(
    invoice as unknown as Parameters<typeof pdfInvoiceFromDb>[0],
    items ?? [],
    orgInfo,
  );

  const stream = await renderToStream(<QuotePdfDocument quote={pdfInvoice} />);

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfInvoice.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
