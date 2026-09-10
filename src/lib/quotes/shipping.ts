/**
 * How the shipping line behaves on a document.
 *   standard - a fixed shipping charge (the original behaviour).
 *   estimate - a NOT-TO-EXCEED cap. The quote bills the cap; the invoice asks
 *              for the real amount + a tracking number once the order ships.
 *   pickup   - local pickup / dropoff. Mechanically identical to standard
 *              (an optional fee), it just says so on the document.
 * As with every other adjustment, a zero amount hides the row entirely.
 *
 * This lives here rather than in the Drizzle schema because client components
 * need it at runtime, and importing the schema module would drag the ORM into
 * the browser bundle. The `shipping_mode` columns are plain text.
 */
export const shippingModes = ["standard", "estimate", "pickup"] as const;
export type ShippingMode = (typeof shippingModes)[number];

export const SHIPPING_MODE_LABELS: Record<ShippingMode, string> = {
  standard: "Standard shipping",
  estimate: "Shipping estimate (capped)",
  pickup: "Local pickup / dropoff",
};

export const SHIPPING_MODE_HINTS: Record<ShippingMode, string> = {
  standard: "A fixed shipping charge. Leave at 0 to hide the line.",
  estimate:
    "Billed as a not-to-exceed cap. Once the order ships, the invoice takes the real cost and a tracking number.",
  pickup: "No carrier. Add a dropoff fee if you charge one, or leave at 0 to hide the line.",
};

/**
 * How the shipping row reads on a document. `capAmount` must already be
 * formatted as money by the caller (the PDF and the app format differently).
 *
 * An estimate only reads as capped while the real cost is unknown — once an
 * invoice records the actual amount, callers pass "standard" so it goes back to
 * reading as an ordinary shipping charge.
 */
export function shippingRowLabel(mode: ShippingMode, capAmount: string): string {
  switch (mode) {
    case "estimate":
      return `SHIPPING - CAPPED AT ${capAmount}`;
    case "pickup":
      return "Local pickup / dropoff";
    default:
      return "Shipping";
  }
}
