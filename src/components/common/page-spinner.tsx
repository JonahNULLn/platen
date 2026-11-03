import { Arc } from "@/components/ui/arc";

/**
 * Full-area loading state for pages whose layout isn't predictable enough for
 * a skeleton (forms, importers, the catch-all fallback).
 */
export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <Arc size="lg" />
    </div>
  );
}
