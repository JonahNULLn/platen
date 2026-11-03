import {
  ListPageSkeleton,
  PageHeaderSkeleton,
  TableRowsSkeleton,
} from "@/components/common/list-page-skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, skeletonKeys } from "@/components/ui/skeleton";

/** Mirrors app/(app)/invoices/page.tsx in its default (list) view. */
export function InvoiceListSkeleton() {
  return (
    <ListPageSkeleton
      title="Invoices"
      filters={5}
      actions={2}
      columns={[
        { label: "Invoice", cell: "text" },
        { label: "Customer", cell: "customer" },
        { label: "Status", cell: "badge" },
        { label: "Issued", cell: "text" },
        { label: "Total", cell: "money", align: "right" },
        { label: "Amount due", cell: "money", align: "right" },
      ]}
    />
  );
}

/** A sidebar card: title + label/value rows. */
export function SummaryCardSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="space-y-3">
        {skeletonKeys(rows).map((key) => (
          <div key={key} className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Mirrors app/(app)/invoices/[id]/page.tsx: line items left, summary cards right. */
export function InvoiceDetailSkeleton() {
  return (
    <>
      <Skeleton className="mb-4 h-8 w-24" />
      <PageHeaderSkeleton title="Invoice" actions={3} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="p-0">
            <TableRowsSkeleton
              rows={4}
              columns={[
                { label: "Item", cell: "text" },
                { label: "Qty", cell: "money", align: "right" },
                { label: "Unit", cell: "money", align: "right" },
                { label: "Total", cell: "money", align: "right" },
              ]}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <SummaryCardSkeleton rows={6} />
          <SummaryCardSkeleton rows={3} />
          <SummaryCardSkeleton rows={2} />
        </div>
      </div>
    </>
  );
}
