import type { ReactNode } from "react";

import { PageHeader } from "@/components/common/page-header";
import { InlineSkeleton, Skeleton, skeletonKeys } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** What a column's cells look like while loading. */
export type SkeletonColumn = {
  label: string;
  /** text = a plain bar, customer = avatar + name, badge = pill, money = short right-aligned bar. */
  cell: "text" | "customer" | "badge" | "money";
  align?: "right";
};

/** The page header while a page loads: real title, pulsing subtitle + actions. */
export function PageHeaderSkeleton({ title, actions = 1 }: { title: string; actions?: number }) {
  return (
    <PageHeader
      title={title}
      subtitle={<InlineSkeleton className="h-4 w-20" />}
      actions={
        actions > 0 ? (
          <>
            {skeletonKeys(actions).map((key) => (
              <Skeleton key={key} className="h-8 w-24" />
            ))}
          </>
        ) : null
      }
    />
  );
}

/** Pill-shaped placeholders for a <ListFilterTabs> row. */
export function FilterTabsSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {skeletonKeys(count).map((key, i) => (
        <Skeleton key={key} className={cn("h-6 rounded-full", i === 0 ? "w-10" : "w-20")} />
      ))}
    </div>
  );
}

function SkeletonCell({ kind }: { kind: SkeletonColumn["cell"] }): ReactNode {
  switch (kind) {
    case "customer":
      return (
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      );
    case "badge":
      return <Skeleton className="h-5 w-16 rounded-full" />;
    case "money":
      return <Skeleton className="ml-auto h-4 w-16" />;
    default:
      return <Skeleton className="h-4 w-24" />;
  }
}

/** A list table with real column headings and pulsing rows. */
export function TableRowsSkeleton({
  columns,
  rows = 8,
}: {
  columns: SkeletonColumn[];
  rows?: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => (
            <TableHead key={c.label} className={c.align === "right" ? "text-right" : undefined}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {skeletonKeys(rows).map((key) => (
          <TableRow key={key} className="hover:bg-transparent">
            {columns.map((c) => (
              <TableCell key={c.label} className="py-2.5">
                <SkeletonCell kind={c.cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Loading state for the quotes / invoices / jobs lists: header, filter pills,
 * and the list table (the default view) with the page's real column headings.
 */
export function ListPageSkeleton({
  title,
  filters,
  columns,
  actions = 1,
}: {
  title: string;
  filters: number;
  columns: SkeletonColumn[];
  actions?: number;
}) {
  return (
    <>
      <PageHeaderSkeleton title={title} actions={actions} />
      <FilterTabsSkeleton count={filters} />
      <TableRowsSkeleton columns={columns} />
    </>
  );
}
