import { CARRIER_LABELS, CARRIER_LOGOS, type ShippingCarrier } from "@/lib/shipping/carriers";
import { cn } from "@/lib/utils";

/**
 * A carrier's official logo, for the app UI only — nothing carrier-branded is
 * ever rendered on a quote or invoice.
 *
 * Rendered bare, with no backing tile. Watch FedEx in dark mode — its "Fed" is
 * a near-black purple (#29007c) that loses contrast on a dark surface; if that
 * reads badly, wrap the mark in a light tile again.
 * "Other" has no logo, but still reserves the box so labels stay aligned in a
 * list.
 */
export function CarrierLogo({
  carrier,
  className,
}: {
  carrier: ShippingCarrier;
  className?: string;
}) {
  const src = CARRIER_LOGOS[carrier];
  if (!src) return <span aria-hidden className={cn("size-5 shrink-0", className)} />;
  return (
    <span className={cn("inline-flex size-5 shrink-0 items-center justify-center", className)}>
      <img src={src} alt={CARRIER_LABELS[carrier]} className="size-full object-contain" />
    </span>
  );
}
