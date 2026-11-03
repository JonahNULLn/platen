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

// ── Multiple packages ───────────────────────────────────────────────────

/**
 * One package on an invoice: a shipping label. Stored as a JSONB array on
 * `invoices.shipments`. `cost` is what that label cost — only used on
 * capped-estimate invoices, where the packages' costs add up to the shipping
 * actually billed. Null = not entered.
 */
export type InvoiceShipment = {
  id: string;
  carrier: ShippingCarrier;
  trackingNumber: string;
  cost: number | null;
};

/**
 * How each carrier's tracking page takes several numbers in ONE link, or null
 * when it can't. None of this is documented by the carriers — it was tested by
 * hand (Nov 2026): UPS reads a space-separated list (a comma is taken as part of
 * one number), USPS a comma-separated one, and FedEx rejected every separator.
 * Stored already URL-encoded, exactly as the forms that were tested.
 */
const MULTI_TRACKING_SEPARATOR: Record<ShippingCarrier, string | null> = {
  ups: "%20",
  usps: ",",
  fedex: null,
  other: null,
};

/** UPS's tracking page caps a lookup at 25 numbers; keep every carrier under it. */
const MAX_NUMBERS_PER_LINK = 25;

export type TrackingGroup = {
  carrier: ShippingCarrier;
  numbers: string[];
  /**
   * One link that tracks every number in the group, or null when the carrier
   * can't do that (FedEx with 2+, "other") — link each number on its own then.
   */
  url: string | null;
};

/**
 * Packages with a tracking number, grouped by carrier (in first-seen order) —
 * carriers can't share a tracking page, so "track all" is one link per group.
 */
export function trackingGroups(shipments: InvoiceShipment[]): TrackingGroup[] {
  const groups: TrackingGroup[] = [];
  for (const s of shipments) {
    const number = s.trackingNumber.trim();
    if (!number) continue;
    let group = groups.find((g) => g.carrier === s.carrier);
    if (!group) {
      group = { carrier: s.carrier, numbers: [], url: null };
      groups.push(group);
    }
    if (!group.numbers.includes(number)) group.numbers.push(number);
  }
  for (const g of groups) g.url = trackAllUrl(g.carrier, g.numbers);
  return groups;
}

function trackAllUrl(carrier: ShippingCarrier, numbers: string[]): string | null {
  if (numbers.length === 1) return trackingUrl(carrier, numbers[0]);
  const separator = MULTI_TRACKING_SEPARATOR[carrier];
  const template = CARRIER_TRACKING_URLS[carrier];
  if (!separator || !template || numbers.length > MAX_NUMBERS_PER_LINK) return null;
  return template.replace("[TRACKING NUMBER]", numbers.map(encodeURIComponent).join(separator));
}

/** Narrow an untyped JSONB value (from a Supabase select) to shipments. */
export function parseShipments(value: unknown): InvoiceShipment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): InvoiceShipment[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const r = raw as Record<string, unknown>;
    const cost =
      typeof r.cost === "number" ? r.cost : typeof r.cost === "string" ? Number(r.cost) : null;
    return [
      {
        id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
        carrier: isShippingCarrier(r.carrier) ? r.carrier : "other",
        trackingNumber: typeof r.trackingNumber === "string" ? r.trackingNumber : "",
        cost: cost !== null && Number.isFinite(cost) ? cost : null,
      },
    ];
  });
}
