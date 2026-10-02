import type { PlacementEntry } from "@/lib/db/schema/quotes";
import type { RefPlacement } from "@/lib/quotes/types";

/**
 * Reconnect a placement stored on a saved quote to the tenant's current
 * placement settings.
 *
 * Two jobs:
 *
 * 1. Relink the id. Saving the Placements card deletes and re-inserts every
 *    row, so the `placementId` a quote stored usually points at a row that no
 *    longer exists. The name survives, so fall back to matching on that.
 *    Without this, changing the color count on an old quote's placement looks
 *    up a base price by a dead id and silently drops it.
 *
 * 2. Fill in ink cost for quotes saved before ink cost existed. A placement
 *    that recorded its own rate keeps it (that's the snapshot); one that didn't
 *    borrows today's rate for the same placement. This only ever feeds
 *    cost/profit — the stored price is never touched, so totals can't move.
 *
 * Placements typed in by hand (no id when saved) stay unlinked and carry no
 * ink cost, which the totals engine counts as $0.
 */
export function hydratePlacement(
  stored: Pick<PlacementEntry, "placementId" | "placementName" | "inkCostPerColor">,
  current: RefPlacement[],
): { placementId: string | null; inkCostPerColor: number | null } {
  if (stored.placementId === null) {
    return { placementId: null, inkCostPerColor: stored.inkCostPerColor ?? null };
  }
  const wanted = stored.placementName.trim().toLowerCase();
  const match =
    current.find((p) => p.id === stored.placementId) ??
    current.find((p) => p.name.trim().toLowerCase() === wanted) ??
    null;
  return {
    // Keep the old id if nothing matches, so the quote doesn't lose the link.
    placementId: match?.id ?? stored.placementId,
    inkCostPerColor: stored.inkCostPerColor ?? match?.inkCostPerColor ?? null,
  };
}
