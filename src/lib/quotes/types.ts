import type { CustomProductConfig, CustomSelections } from "@/lib/catalog/custom-product";
import type { PaymentInstallment } from "@/lib/payments/payment-terms";
import type { LineItemCalc } from "./totals";

/** Reference data the builder needs — all loaded server-side, passed as props. */
export type RefProductPricing = {
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
  cost: number | null;
};
export type RefProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  minQuantity: number | null;
  pricing: RefProductPricing[];
  /** "distributor" | "custom". */
  source: string;
  /** Pricing blocks + methods for custom products; null for distributor ones. */
  config: CustomProductConfig | null;
  /** Manufacturer brand + style/model number (distributor products; null for custom). */
  brand: string | null;
  styleNumber: string | null;
};

/** Default line-item name for a product: "Brand StyleNumber", else its own name. */
export function productBaseName(product: RefProduct): string {
  const model = [product.brand, product.styleNumber].filter(Boolean).join(" ");
  return model || product.name;
}

export type RefCustomer = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  /** Optional invoicing email; null means "use the contact email". */
  billingEmail: string | null;
  phone: string | null;
  // Billing address.
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  /** When false, goods ship to the billing address above. */
  shipToDifferent: boolean;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  isTaxExempt: boolean;
  taxExemptId: string | null;
  defaultPaymentTerms: string | null;
  logoUrl: string | null;
};
export type RefCategory = { id: string; name: string };
export type RefSize = { label: string; upcharge: number };
export type RefColor = { id: string; name: string; hex: string | null };
export type RefPlacement = {
  id: string;
  name: string;
  defaultPrice: number;
  /** Our ink cost per color per print — cost side only. */
  inkCostPerColor: number;
};
export type RefColorTier = { colorCount: number; price: number };
export type RefFee = { id: string; name: string; defaultAmount: number; isPerColor: boolean };
export type RefPaymentTerm = {
  id: string;
  name: string;
  isDefault: boolean;
  installments: PaymentInstallment[];
};

export type QuoteRefData = {
  customers: RefCustomer[];
  products: RefProduct[];
  categories: RefCategory[];
  sizes: RefSize[];
  colors: RefColor[];
  placements: RefPlacement[];
  colorTiers: RefColorTier[];
  fees: RefFee[];
  paymentTerms: RefPaymentTerm[];
  defaultTaxRate: number;
  /** Flat per-item markup added to a variant's wholesale cost to get sell price. */
  defaultMarkup: number;
  /** Profit/cost/margin are owner/admin-only. */
  canSeeProfit: boolean;
};

/**
 * A distributor product's variants, grouped for the line-item editor.
 * Loaded lazily when a product is added to a line. Empty for custom products.
 */
export type VariantMatrix = {
  colors: string[];
  sizesByColor: Record<string, { size: string; cost: number | null }[]>;
};

// Canonical apparel size order for sorting variant rows (the SDL import didn't
// keep SanMar's size index). Unknown labels sort last, alphabetically.
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL", "6XL"];
export function sizeRank(label: string): number {
  const i = SIZE_ORDER.indexOf(label.trim().toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}
export function compareSizes(a: string, b: string): number {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  return ra === rb ? a.localeCompare(b) : ra - rb;
}

// ── Client builder shapes (strings for inputs; parsed when calculating/saving) ──

export type BuilderSize = {
  size: string;
  qty: string;
  unitPrice: string;
  /** Per-size cost: the distributor's wholesale price unless typed over. */
  unitCost: string;
  overridden: boolean;
  /** true once the cost is typed over; the reset button restores wholesale. */
  costOverridden: boolean;
};
export type BuilderPlacement = {
  key: string;
  placementId: string | null;
  placementName: string;
  colorCount: string;
  price: string;
  /** Snapshotted from the placement when picked; null = unknown ($0). Not editable. */
  inkCostPerColor: number | null;
};
export type BuilderLine = {
  key: string;
  itemType: "product" | "custom" | "fee";
  tenantProductId: string | null;
  name: string;
  description: string;
  colorName: string;
  notes: string;
  unitPrice: string;
  unitCost: string;
  quantity: string;
  sizes: BuilderSize[];
  placements: BuilderPlacement[];
  /** Quote-time choices for a custom product (session-only for now). */
  customSelections?: CustomSelections;
  /** Custom product: true once the unit price is manually edited, so option /
   *  quantity changes stop overwriting it with the computed default. */
  unitPriceOverridden?: boolean;
};

let keySeq = 0;
export function nextKey(prefix = "k"): string {
  keySeq += 1;
  return `${prefix}-${Date.now()}-${keySeq}`;
}

/** The pricing tier that applies at a given total quantity. */
export function tierForQuantity(
  pricing: RefProductPricing[],
  qty: number,
): RefProductPricing | null {
  if (pricing.length === 0) return null;
  const sorted = [...pricing].sort((a, b) => a.minQuantity - b.minQuantity);
  let match: RefProductPricing | null = sorted[0] ?? null;
  for (const tier of sorted) {
    if (qty >= tier.minQuantity && (tier.maxQuantity === null || qty <= tier.maxQuantity)) {
      return tier;
    }
    if (qty >= tier.minQuantity) match = tier;
  }
  return match;
}

/** Print price for a placement at a given ink-color count. */
export function colorTierPrice(tiers: RefColorTier[], colorCount: number): number {
  if (colorCount <= 0) return 0;
  const exact = tiers.find((t) => t.colorCount === colorCount);
  if (exact) return exact.price;
  const below = tiers
    .filter((t) => t.colorCount <= colorCount)
    .sort((a, b) => b.colorCount - a.colorCount);
  return below[0]?.price ?? 0;
}

const n = (v: string): number => {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A builder line in the shape the totals engine expects. */
export function lineToCalc(line: BuilderLine): LineItemCalc {
  const usesSizes = line.itemType !== "fee" && line.sizes.length > 0;
  return {
    quantity: Math.trunc(n(line.quantity)),
    unitPrice: n(line.unitPrice),
    unitCost: line.unitCost.trim() === "" ? null : n(line.unitCost),
    sizesBreakdown: usesSizes
      ? line.sizes.map((s) => ({
          size: s.size,
          qty: Math.trunc(n(s.qty)),
          unitPrice: n(s.unitPrice),
          unitCost: s.unitCost.trim() === "" ? undefined : n(s.unitCost),
          overridden: s.overridden,
        }))
      : null,
    placementsData:
      line.placements.length > 0
        ? line.placements.map((p) => ({
            placementId: p.placementId,
            placementName: p.placementName,
            colorCount: Math.trunc(n(p.colorCount)),
            price: n(p.price),
            inkCostPerColor: p.inkCostPerColor,
          }))
        : null,
  };
}
