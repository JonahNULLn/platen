import { cn } from "@/lib/utils";

const skeletonClasses = "animate-pulse rounded-md bg-muted";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn(skeletonClasses, className)} {...props} />;
}

/** Inline (span) skeleton — for spots that only allow phrasing content, like
 *  a <PageHeader> subtitle (rendered inside a <p>). */
function InlineSkeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton"
      className={cn("inline-block align-middle", skeletonClasses, className)}
      {...props}
    />
  );
}

/**
 * Stable keys for a fixed-length list of placeholders, so skeleton maps don't
 * key on the array index: `skeletonKeys(4).map((key) => <Skeleton key={key} />)`.
 */
function skeletonKeys(count: number, prefix = "sk"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

export { InlineSkeleton, Skeleton, skeletonKeys };
