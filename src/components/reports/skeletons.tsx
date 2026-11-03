import { TableRowsSkeleton } from "@/components/common/list-page-skeleton";
import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors app/(app)/reports/page.tsx: filter bar over an invoice table. */
export function ReportsSkeleton() {
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Find and export invoices by period, status, or customer."
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-52" />
        </div>
        <TableRowsSkeleton
          columns={[
            { label: "Invoice", cell: "text" },
            { label: "Customer", cell: "customer" },
            { label: "Status", cell: "badge" },
            { label: "Issued", cell: "text" },
            { label: "Total", cell: "money", align: "right" },
          ]}
        />
      </div>
    </>
  );
}
