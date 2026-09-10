/**
 * Shipping carriers and their public tracking deep-links.
 *
 * Picking a carrier turns an invoice's tracking number into a link straight to
 * that carrier's tracking page. "other" is the escape hatch for anything we
 * don't have a URL for — the number is still recorded, it just stays plain text.
 *
 * Plain module (no DB / no React) so client components, server actions and the
 * PDF template can all share it. The `shipping_carrier` column is plain text.
 */

export const shippingCarriers = ["ups", "usps", "fedex", "other"] as const;
export type ShippingCarrier = (typeof shippingCarriers)[number];

export const CARRIER_LABELS: Record<ShippingCarrier, string> = {
  ups: "UPS",
  usps: "USPS",
  fedex: "FedEx",
  other: "Other",
};

/** `[TRACKING NUMBER]` is substituted with the encoded tracking number. */
const CARRIER_TRACKING_URLS: Record<ShippingCarrier, string | null> = {
  ups: "https://www.ups.com/track?tracknum=[TRACKING NUMBER]",
  usps: "https://tools.usps.com/go/TrackConfirmAction?tLabels=[TRACKING NUMBER]",
  fedex: "https://www.fedex.com/fedextrack/?trknbr=[TRACKING NUMBER]",
  other: null,
};

/**
 * Official carrier artwork in `public/carriers/`. All three are square
 * (viewBox 0 0 2000 2000) full-colour SVGs, so they letterbox cleanly in a
 * square box with `object-contain`.
 *
 * Paths are case-sensitive once deployed — they must match the filenames on
 * disk exactly. App-only: no carrier branding goes on a quote or invoice.
 */
export const CARRIER_LOGOS: Record<ShippingCarrier, string | null> = {
  ups: "/carriers/UPS.svg",
  usps: "/carriers/USPS.svg",
  fedex: "/carriers/FedEx.svg",
  other: null,
};

export function isShippingCarrier(value: unknown): value is ShippingCarrier {
  return typeof value === "string" && (shippingCarriers as readonly string[]).includes(value);
}

/**
 * Public tracking URL for a shipment, or null when we can't build one — no
 * carrier, no tracking number, or a carrier we have no URL for ("other").
 * Callers should render plain text whenever this returns null.
 */
export function trackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  const number = trackingNumber?.trim();
  if (!number || !isShippingCarrier(carrier)) return null;
  const template = CARRIER_TRACKING_URLS[carrier];
  if (!template) return null;
  return template.replace("[TRACKING NUMBER]", encodeURIComponent(number));
}
