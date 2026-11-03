import { renderToStream } from "@react-pdf/renderer";

import { getActiveContext } from "@/lib/auth/session";
import { PackingSlipPdfDocument } from "@/lib/pdf/packing-slip-pdf";
import { pdfPackingSlipFromDb } from "@/lib/pdf/snapshot";
import { getOrgPdfInfo } from "@/lib/quotes/ref-data";
import { createClient } from "@/lib/supabase/server";

type SlipInvoice = Parameters<typeof pdfPackingSlipFromDb>[0] & {
  invoice_line_items: Parameters<typeof pdfPackingSlipFromDb>[1] | null;
};

/**
 * A job's packing slip as a PDF. Only exists once it's been generated (a
 * `packing_slips` row); renders from the job's invoice snapshot, so it always
 * reflects the invoice's items and current tracking, plus the slip's options.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const supabase = await createClient();
  const [{ data: job }, { data: slipRow }] = await Promise.all([
    supabase
      .from("jobs")
      .select("invoice_id")
      .eq("id", id)
      .eq("tenant_id", ctx.orgId)
      .maybeSingle<{ invoice_id: string }>(),
    supabase
      .from("packing_slips")
      .select("created_at, ship_date, note_title, note_body, footer_text")
      .eq("job_id", id)
      .eq("tenant_id", ctx.orgId)
      .maybeSingle<Parameters<typeof pdfPackingSlipFromDb>[3]>(),
  ]);
  if (!job) return new Response("Not found", { status: 404 });
  if (!slipRow) {
    return new Response("No packing slip has been generated for this job", { status: 404 });
  }

  const [{ data: invoice }, org] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "invoice_number, issue_date, customer_name, customer_company, customer_address_line1, customer_address_line2, customer_city, customer_state, customer_postal_code, customer_country, purchase_order, approved_by_name, shipments, invoice_line_items(item_type, name, description, quantity, color_name, sort_order, sizes_breakdown, placements_data)",
      )
      .eq("id", job.invoice_id)
      .eq("tenant_id", ctx.orgId)
      .maybeSingle<SlipInvoice>(),
    getOrgPdfInfo(),
  ]);
  if (!invoice) return new Response("Invoice not found", { status: 404 });
  if (!org) return new Response("Org not found", { status: 404 });

  const slip = pdfPackingSlipFromDb(invoice, invoice.invoice_line_items ?? [], org, slipRow);
  const stream = await renderToStream(<PackingSlipPdfDocument slip={slip} />);

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slip.invoiceNumber}_Packing-Slip.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
