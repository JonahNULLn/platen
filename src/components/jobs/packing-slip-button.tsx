"use client";

import { ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { InvoicePdfPreviewSheet } from "@/components/invoices/invoice-pdf-preview-sheet";
import { Button } from "@/components/ui/button";
import { Ring } from "@/components/ui/ring";
import { generatePackingSlip } from "@/lib/actions/jobs";

/**
 * "Generate packing slip" until the job has one, then "Packing slip" to view
 * it. Generating opens the preview straight away, like generating an invoice
 * takes you to it.
 */
export function PackingSlipButton({
  jobId,
  invoiceNumber,
  generated,
  canGenerate,
}: {
  jobId: string;
  invoiceNumber: string;
  generated: boolean;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function handleGenerate() {
    setBusy(true);
    const result = await generatePackingSlip(jobId);
    setBusy(false);
    if (!result.ok) {
      toast.error("Couldn't generate packing slip", { description: result.error });
      return;
    }
    toast.success("Packing slip generated");
    router.refresh();
    setPreviewOpen(true);
  }

  if (!generated && !canGenerate) return null;

  return (
    <>
      {generated ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          className="gap-1.5"
        >
          <ClipboardList className="size-3.5" /> Packing slip
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={busy}
          className="gap-1.5"
        >
          {busy ? (
            <Ring size="sm" className="text-current" />
          ) : (
            <ClipboardList className="size-3.5" />
          )}
          Generate packing slip
        </Button>
      )}

      <InvoicePdfPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={`/api/jobs/${jobId}/packing-slip`}
        invoiceNumber={invoiceNumber}
        docLabel="Packing slip"
        fileName={`${invoiceNumber || "job"}_Packing-Slip.pdf`}
      />
    </>
  );
}
