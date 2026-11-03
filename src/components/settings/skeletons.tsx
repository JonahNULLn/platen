import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, skeletonKeys } from "@/components/ui/skeleton";

/** One settings page's content (the settings nav stays put in the layout). */
export function SettingsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      {skeletonKeys(2).map((key) => (
        <Card key={key}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-52" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {skeletonKeys(4).map((key) => (
              <div key={key} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
