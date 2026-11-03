import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, skeletonKeys } from "@/components/ui/skeleton";

/** Mirrors app/(app)/dashboard/page.tsx: stat row, two charts, activity feed. */
export function DashboardSkeleton() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back — here's what's happening in your shop."
        actions={
          <>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-28" />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {skeletonKeys(4).map((key) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 p-5 lg:col-span-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          {/* Bar-chart silhouette. */}
          <div className="flex h-44 items-end gap-2">
            {[40, 65, 50, 80, 55, 90, 70, 60, 85, 45, 75, 95].map((h) => (
              <Skeleton key={`bar-${h}`} className={`flex-1 ${BAR_HEIGHTS[h]}`} />
            ))}
          </div>
        </Card>
        <Card className="space-y-4 p-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
          {skeletonKeys(5).map((key) => (
            <div key={key} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="space-y-2 border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="divide-y divide-border">
          {skeletonKeys(5).map((key) => (
            <div key={key} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// Static class names (Tailwind can't see dynamically built ones).
const BAR_HEIGHTS: Record<number, string> = {
  40: "h-[40%]",
  45: "h-[45%]",
  50: "h-[50%]",
  55: "h-[55%]",
  60: "h-[60%]",
  65: "h-[65%]",
  70: "h-[70%]",
  75: "h-[75%]",
  80: "h-[80%]",
  85: "h-[85%]",
  90: "h-[90%]",
  95: "h-[95%]",
};
