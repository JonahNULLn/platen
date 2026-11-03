"use client";

import { ClipboardList, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EntityDatesForm, useEntityDates } from "@/components/dev/entity-dates";
import { Ring } from "@/components/ui/ring";
import { Separator } from "@/components/ui/separator";
import { deletePackingSlip } from "@/lib/actions/debug";

/**
 * Debug panel section for a job's packing slip: its dates + a delete button.
 * Renders nothing unless the job actually has a slip — no slip, no section.
 */
export function PackingSlipDebugSection({ jobId }: { jobId: string }) {
  const router = useRouter();
  const dates = useEntityDates("packing_slip", jobId);
  const [deleting, setDeleting] = useState(false);

  if (dates.status !== "ready") return null;

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    const res = await deletePackingSlip(jobId);
    setDeleting(false);
    if (!res.ok) {
      toast.error("Couldn't delete packing slip", { description: res.error });
      return;
    }
    toast.success("Packing slip deleted");
    dates.markMissing();
    router.refresh();
  }

  return (
    <>
      <Separator />
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ClipboardList className="size-3.5" /> Packing slip
        </h3>
        <EntityDatesForm state={dates} />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Leave ship date empty to print the generated date.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          {deleting ? <Ring size="sm" className="text-current" /> : <Trash2 className="size-3.5" />}
          Delete packing slip
        </button>
      </section>
    </>
  );
}
