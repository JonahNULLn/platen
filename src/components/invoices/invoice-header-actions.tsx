"use client";

import { Ban, Briefcase, Download, Eye, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { InvoicePdfPreviewSheet } from "@/components/invoices/invoice-pdf-preview-sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ring } from "@/components/ui/ring";
import { voidInvoice } from "@/lib/actions/invoices";
import { generateJob } from "@/lib/actions/jobs";

export function InvoiceHeaderActions({
  invoiceId,
  invoiceNumber,
  status,
  canManage,
  existingJobId,
  trackingUrl,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  canManage: boolean;
  existingJobId: string | null;
  trackingUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;

  // A job can be generated from any live invoice — paid or not. Only void and
  // refunded invoices are dead documents that shouldn't spawn work.
  const jobEligible = status !== "void" && status !== "refunded";
  const canVoid = canManage && status !== "void" && status !== "refunded";

  async function handleGenerateJob() {
    setBusy(true);
    const result = await generateJob(invoiceId);
    setBusy(false);
    if (!result.ok) {
      toast.error("Couldn't generate job", { description: result.error });
      return;
    }
    toast.success("Job created");
    router.push(`/jobs/${result.jobId}`);
  }

  async function handleVoid() {
    const result = await voidInvoice(invoiceId);
    if (!result.ok) {
      toast.error("Couldn't void invoice", { description: result.error });
      return;
    }
    toast.success("Invoice voided");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          className="gap-1.5"
        >
          <Eye className="size-4" /> Preview
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={pdfUrl} download={`${invoiceNumber || "invoice"}.pdf`}>
            <Download className="size-4" /> Download
          </a>
        </Button>

        {existingJobId ? (
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <Link href={`/jobs/${existingJobId}`}>
              <Briefcase className="size-3.5" /> View job
            </Link>
          </Button>
        ) : jobEligible && canManage ? (
          <Button size="sm" onClick={handleGenerateJob} disabled={busy} className="gap-1.5">
            {busy ? (
              <Ring size="sm" className="text-current" />
            ) : (
              <Briefcase className="size-3.5" />
            )}
            Generate job
          </Button>
        ) : null}

        {canVoid ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(e) => e.preventDefault()}
                    className="gap-2"
                  >
                    <Ban className="size-4" /> Void invoice
                  </DropdownMenuItem>
                }
                title="Void this invoice?"
                description="It stays on record but no longer counts as owed. This can't be undone here."
                confirmLabel="Void invoice"
                variant="destructive"
                onConfirm={handleVoid}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <InvoicePdfPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={pdfUrl}
        invoiceNumber={invoiceNumber}
        trackingUrl={trackingUrl}
      />
    </>
  );
}
