import type { PlacementEntry, SizeBreakdownEntry } from "@/lib/db/schema/quotes";

/**
 * Quote math — a pure module shared by the live builder (client) and the save
 * action (server), so the number you see is exactly the number we store.
 *
 * Pricing model (screen-print convention):
 *   - A line's size rows carry qty + an effective per-unit price (blank base +
 *     size upcharge, or a manual override).
 *   - Each placement adds a per-garment charge (color-count price + placement
 *     base), multiplied by the line's total quantity.
 *   - line total = Σ(size.qty × size.unitPrice) + totalQty × Σ(placement.price)
 *   - Fee / simple custom lines are just quantity × unitPrice.
 *
 * Cost mirrors that: garment cost per size, plus each placement's ink cost
 * (rate per color × colors) for every garment printed. Ink cost is counted
 * only where placements are priced, so cost and price stay comparable.
 */

export type LineItemCalc = {
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  sizesBreakdown: SizeBreakdownEntry[] | null;
  placementsData: PlacementEntry[] | null;
};

export type LineTotals = {
  quantity: number;
  totalPrice: number;
  totalCost: number;
  /**
   * The printing slice of this line's profit: placement charges minus ink.
   * A breakdown only — it's already inside totalPrice/totalCost, so never
   * subtract it from anything.
   */
  printProfit: number;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLineTotals(line: LineItemCalc): LineTotals {
  const sizes = line.sizesBreakdown ?? [];
  if (sizes.length > 0) {
    const quantity = sizes.reduce((sum, s) => sum + (s.qty || 0), 0);
    const garment = sizes.reduce((sum, s) => sum + (s.qty || 0) * (s.unitPrice || 0), 0);
    // Per-size cost when present (per-variant pricing), else the line's single
    // cost applied across the quantity (custom items).
    const cost = sizes.reduce(
      (sum, s) => sum + (s.qty || 0) * (s.unitCost ?? line.unitCost ?? 0),
      0,
    );
    const placementPerGarment = (line.placementsData ?? []).reduce(
      (sum, p) => sum + (p.price || 0),
      0,
    );
    // Missing ink cost (old quotes, hand-typed placements) counts as $0.
    const inkPerGarment = (line.placementsData ?? []).reduce(
      (sum, p) => sum + (p.inkCostPerColor ?? 0) * (p.colorCount || 0),
      0,
    );
    return {
      quantity,
      totalPrice: round2(garment + quantity * placementPerGarment),
      totalCost: round2(cost + quantity * inkPerGarment),
      printProfit: round2(quantity * (placementPerGarment - inkPerGarment)),
    };
  }
  const quantity = line.quantity || 0;
  return {
    quantity,
    totalPrice: round2(quantity * (line.unitPrice || 0)),
    totalCost: round2(quantity * (line.unitCost ?? 0)),
    // Unsized lines don't price their placements, so there's no print slice.
    printProfit: 0,
  };
}

export type QuoteAdjustments = {
  discountType: "amount" | "percent";
  discountValue: number;
  depositType: "amount" | "percent";
  depositValue: number;
  shippingAmount: number;
  taxRate: number; // decimal, e.g. 0.0925
  isTaxExempt: boolean;
};

export type QuoteTotals = {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  cost: number;
  profit: number;
  marginPct: number;
  depositAmount: number;
  /**
   * How much of `profit` came from printing (placement charges − ink cost),
   * before any order discount. Informational: it's already counted in profit.
   */
  printProfit: number;
};

export function computeQuoteTotals(lines: LineItemCalc[], adj: QuoteAdjustments): QuoteTotals {
  let subtotal = 0;
  let cost = 0;
  let printProfit = 0;
  for (const line of lines) {
    const t = computeLineTotals(line);
    subtotal += t.totalPrice;
    cost += t.totalCost;
    printProfit += t.printProfit;
  }
  subtotal = round2(subtotal);
  cost = round2(cost);

  const discountAmount = round2(
    adj.discountType === "percent"
      ? (subtotal * (adj.discountValue || 0)) / 100
      : Math.min(adj.discountValue || 0, subtotal),
  );
  const taxableBase = round2(subtotal - discountAmount);
  const shippingAmount = round2(adj.shippingAmount || 0);
  // Tax applies to goods (after discount) + shipping. taxableBase itself stays
  // goods-only since profit is measured against it below.
  const taxAmount = adj.isTaxExempt
    ? 0
    : round2((taxableBase + shippingAmount) * (adj.taxRate || 0));
  const total = round2(taxableBase + taxAmount + shippingAmount);

  // Profit is on the goods/printing only — excludes pass-through tax and
  // shipping (whose cost we don't track in v0.1).
  const profit = round2(taxableBase - cost);
  const marginPct = taxableBase > 0 ? round2((profit / taxableBase) * 100) : 0;

  const depositAmount = round2(
    adj.depositType === "percent" ? (total * (adj.depositValue || 0)) / 100 : adj.depositValue || 0,
  );

  return {
    subtotal,
    discountAmount,
    taxableBase,
    taxAmount,
    shippingAmount,
    total,
    cost,
    profit,
    marginPct,
    depositAmount,
    printProfit: round2(printProfit),
  };
}
