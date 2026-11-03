import { ListPageSkeleton, PageHeaderSkeleton } from "@/components/common/list-page-skeleton";
import { BOARD_LANES } from "@/components/jobs/job-status";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, skeletonKeys } from "@/components/ui/skeleton";

/** Mirrors app/(app)/jobs/page.tsx in its default (list) view. */
export function JobListSkeleton() {
  return (
    <ListPageSkeleton
      title="Jobs"
      filters={5}
      columns={[
        { label: "Job", cell: "text" },
        { label: "Customer", cell: "customer" },
        { label: "Due", cell: "text" },
        { label: "Status", cell: "badge" },
        { label: "Payment", cell: "badge" },
        { label: "Units ready", cell: "money", align: "right" },
      ]}
    />
  );
}

/** Mirrors the production board: one lane per stage, with real lane names. */
export function JobBoardSkeleton() {
  return (
    <>
      <PageHeaderSkeleton title="Production" actions={0} />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_LANES.map((lane, laneIndex) => (
          <div
            key={lane.status}
            className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30"
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm font-medium">{lane.label}</span>
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <div className="space-y-2 px-2 pb-2">
              {/* Vary the card count per lane so it reads as a board, not a grid. */}
              {skeletonKeys([2, 1, 3, 1, 2][laneIndex] ?? 1).map((key) => (
                <div
                  key={key}
                  className="space-y-2 rounded-md border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Mirrors app/(app)/jobs/[id]/page.tsx: work units left, activity right. */
export function JobDetailSkeleton() {
  return (
    <>
      <Skeleton className="mb-4 h-8 w-20" />
      <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {skeletonKeys(2).map((key) => (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </CardHeader>
              <CardContent className="space-y-3">
                {skeletonKeys(3).map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="size-4 shrink-0 rounded-sm" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent className="space-y-4">
            {skeletonKeys(4).map((key) => (
              <div key={key} className="space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
