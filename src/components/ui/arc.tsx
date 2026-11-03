import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Arc — a rotating bordered circle: a faint full-circle track with a bright
 * arc sweeping around it. Our own take on loading-ui.com's "Arc" (recreated,
 * not installed). Colour follows `currentColor` (defaults to the primary
 * token); thickness scales with size.
 *
 * Use it where the shape of what's coming isn't known — a page with no
 * dedicated skeleton, a document rendering — and skeletons everywhere else.
 * `<Ring>` stays the small inline spinner for buttons.
 */
const arcVariants = cva("relative inline-block shrink-0", {
  variants: {
    size: {
      sm: "size-4 [--arc-w:2px]",
      md: "size-6 [--arc-w:2.5px]",
      lg: "size-10 [--arc-w:3px]",
      xl: "size-14 [--arc-w:4px]",
    },
  },
  defaultVariants: { size: "md" },
});

type ArcProps = Omit<ComponentProps<"output">, "color"> & VariantProps<typeof arcVariants>;

export function Arc({ size, className, ...props }: ArcProps) {
  return (
    // <output> carries the implicit "status" role for screen readers.
    <output
      aria-label="Loading"
      className={cn("text-primary", arcVariants({ size }), className)}
      {...props}
    >
      {/* Track */}
      <span className="absolute inset-0 rounded-full border-(length:--arc-w) border-current opacity-15" />
      {/* Sweeping arc — eased so it surges and settles rather than ticking. */}
      <span className="absolute inset-0 animate-spin rounded-full border-(length:--arc-w) border-transparent border-t-current [animation-duration:0.9s] [animation-timing-function:cubic-bezier(0.55,0.15,0.45,0.85)]" />
    </output>
  );
}
