import { PageHeaderSkeleton } from "@/components/common/list-page-skeleton";
import { Card } from "@/components/ui/card";
import { Skeleton, skeletonKeys } from "@/components/ui/skeleton";

/** Mirrors app/(app)/catalog/page.tsx: source picker, filters, product grid. */
export function CatalogSkeleton() {
  return (
    <>
      <PageHeaderSkeleton title="Catalog" actions={2} />
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-9 w-full sm:max-w-xs" />
          <Skeleton className="h-9 w-full sm:w-52" />
          <Skeleton className="h-9 w-full sm:w-48" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {skeletonKeys(10).map((key) => (
            <Card key={key} className="gap-0 overflow-hidden border-transparent bg-sidebar p-0">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
