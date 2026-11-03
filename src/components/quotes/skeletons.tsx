import { ListPageSkeleton, PageHeaderSkeleton } from "@/components/common/list-page-skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, skeletonKeys } from "@/components/ui/skeleton";

/** Mirrors app/(app)/quotes/page.tsx in its default (list) view. */
export function QuoteListSkeleton() {
  return (
    <ListPageSkeleton
      title="Quotes"
      filters={5}
      actions={2}
      columns={[
        { label: "Quote", cell: "text" },
        { label: "Customer", cell: "customer" },
        { label: "Status", cell: "badge" },
        { label: "Date", cell: "text" },
        { label: "Total", cell: "money", align: "right" },
      ]}
    />
  );
}

/** A card with a title line and a few form-field rows. */
function FieldsCardSkeleton({ fields }: { fields: number }) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        {skeletonKeys(fields).map((key) => (
          <div key={key} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Mirrors the quote builder (new + detail): customer/details on the left, line
 * items in the middle, totals on the right.
 */
export function QuoteDetailSkeleton({ title = "Quote" }: { title?: string }) {
  return (
    <>
      <PageHeaderSkeleton title={title} actions={2} />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="space-y-6 lg:w-80 lg:shrink-0">
          <FieldsCardSkeleton fields={3} />
          <FieldsCardSkeleton fields={4} />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
          {skeletonKeys(2).map((key) => (
            <Card key={key}>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-12 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {skeletonKeys(5).map((key) => (
                    <Skeleton key={key} className="h-9" />
                  ))}
                </div>
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="lg:w-80 lg:shrink-0">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="space-y-3">
              {skeletonKeys(6).map((key) => (
                <div key={key} className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
              <Skeleton className="mt-2 h-9 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
