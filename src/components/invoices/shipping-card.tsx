"use client";

import { Plus, Truck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MoneyInput } from "@/components/forms/money-input";
import { CarrierLogo } from "@/components/invoices/carrier-logo";
import { TrackingSummary } from "@/components/invoices/track-packages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ring } from "@/components/ui/ring";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setInvoiceShipping } from "@/lib/actions/invoices";
import { formatCurrency } from "@/lib/format";
import type { ShippingMode } from "@/lib/quotes/shipping";
import { round2 } from "@/lib/quotes/totals";
import {
  CARRIER_LABELS,
  type InvoiceShipment,
  type ShippingCarrier,
  shippingCarriers,
  trackingGroups,
} from "@/lib/shipping/carriers";

/** One package being edited — strings for the inputs, parsed on save. */
type PackageRow = {
  id: string;
  carrier: ShippingCarrier;
  trackingNumber: string;
  cost: string;
};

function toRow(s: InvoiceShipment): PackageRow {
  return {
    id: s.id,
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    cost: s.cost === null ? "" : String(s.cost),
  };
}

/** `id` must be stable for the row rendered on the server (hydration), so the
 *  initial blank row passes a fixed one; rows added later get a random id. */
function emptyRow(carrier: ShippingCarrier, id: string = crypto.randomUUID()): PackageRow {
  return { id, carrier, trackingNumber: "", cost: "" };
}

/** Comparable form of the rows, for dirty-checking against what's saved. */
function signature(rows: PackageRow[]): string {
  return JSON.stringify(
    rows
      .map((r) => ({ c: r.carrier, t: r.trackingNumber.trim(), $: r.cost.trim() }))
      .filter((r) => r.t !== "" || r.$ !== ""),
  );
}

/**
 * Shipping + tracking on an invoice — one or more packages (labels).
 *
 * Each package has a carrier and tracking number. On an invoice quoted with a
 * capped estimate each package also takes what its label cost, and those add
 * up to the real shipping billed; the customer's invoice only ever shows that
 * one total. Every other mode keeps the shipping snapshot it was generated
 * with, so only tracking can be added. Nothing is required: an order can ship
 * without tracking, or be picked up and never have any.
 *
 * With a single package the card looks exactly as it always has; adding a
 * second switches to a compact per-package list.
 */
export function ShippingCard({
  invoiceId,
  mode,
  cap,
  actual,
  billed,
  shipments,
  canManage,
}: {
  invoiceId: string;
  mode: ShippingMode;
  cap: number | null;
  actual: number | null;
  billed: number;
  shipments: InvoiceShipment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const savedRows = shipments.length > 0 ? shipments.map(toRow) : [emptyRow("other", "pkg-1")];
  const [rows, setRows] = useState<PackageRow[]>(savedRows);
  const [busy, setBusy] = useState(false);

  const isEstimate = mode === "estimate";
  const dirty = signature(rows) !== signature(savedRows);
  const multiple = rows.length > 1;

  // What the packages add up to right now (estimate invoices only).
  const typedCosts = rows
    .map((r) => (r.cost.trim() === "" ? null : Number(r.cost)))
    .filter((c): c is number => c !== null && Number.isFinite(c));
  const typedTotal = typedCosts.length > 0 ? round2(typedCosts.reduce((s, c) => s + c, 0)) : null;
  const overCap = isEstimate && cap !== null && typedTotal !== null && typedTotal > cap;

  const groups = trackingGroups(shipments);

  function update(id: string, patch: Partial<PackageRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addPackage() {
    // New labels usually go out with the same carrier as the last one.
    setRows((rs) => [...rs, emptyRow(rs[rs.length - 1]?.carrier ?? "other")]);
  }

  function removePackage(id: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    const result = await setInvoiceShipping({
      invoiceId,
      shipments: rows.map((r) => ({
        id: r.id,
        carrier: r.carrier,
        trackingNumber: r.trackingNumber.trim(),
        cost: isEstimate ? r.cost.trim() : "",
      })),
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Shipping updated");
    router.refresh();
  }

  const awaitingActual = isEstimate && actual === null;
  const [single] = rows;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-4" /> Shipping
        </CardTitle>
        <CardDescription>
          {awaitingActual && cap !== null
            ? `Quoted as an estimate capped at ${formatCurrency(cap)}. Enter the real cost once it ships — until then the invoice bills the cap.`
            : isEstimate
              ? `Billing ${formatCurrency(billed)}. Quoted cap was ${formatCurrency(cap ?? 0)}.`
              : mode === "pickup"
                ? "Local pickup / dropoff."
                : `Billing ${formatCurrency(billed)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!multiple && single ? (
          <>
            {isEstimate ? (
              <div className="space-y-2">
                <Label htmlFor={`inv-ship-${single.id}`}>Actual shipping cost</Label>
                <MoneyInput
                  id={`inv-ship-${single.id}`}
                  value={single.cost}
                  onChange={(e) => update(single.id, { cost: e.target.value })}
                  disabled={!canManage}
                  placeholder={cap === null ? "0.00" : cap.toFixed(2)}
                />
              </div>
            ) : null}
            <PackageFields row={single} canManage={canManage} onChange={update} />
          </>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={row.id} className="space-y-2 rounded-md border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Package {i + 1}</span>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-my-1 size-6"
                      onClick={() => removePackage(row.id)}
                      aria-label={`Remove package ${i + 1}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                <PackageFields row={row} canManage={canManage} onChange={update} compact />
                {isEstimate ? (
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`inv-ship-${row.id}`} className="text-xs">
                      Label cost
                    </Label>
                    <MoneyInput
                      id={`inv-ship-${row.id}`}
                      value={row.cost}
                      onChange={(e) => update(row.id, { cost: e.target.value })}
                      disabled={!canManage}
                      className="h-8 w-32"
                    />
                  </div>
                ) : null}
              </div>
            ))}
            {isEstimate ? (
              <div className="flex items-center justify-between px-0.5 text-sm">
                <span className="text-muted-foreground">Actual shipping cost</span>
                <span className="font-medium tabular-nums">
                  {typedTotal === null ? "—" : formatCurrency(typedTotal)}
                </span>
              </div>
            ) : null}
          </div>
        )}

        {overCap ? (
          <p className="text-xs text-destructive">
            Over the {formatCurrency(cap ?? 0)} cap quoted to the customer. Saving bills the full
            amount you enter.
          </p>
        ) : null}

        <TrackingSummary groups={groups} />

        {canManage ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || busy} className="gap-1.5">
              {busy ? <Ring size="sm" className="text-current" /> : null}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={addPackage} className="gap-1.5">
              <Plus className="size-3.5" /> Add package
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Carrier picker + tracking number for one package. */
function PackageFields({
  row,
  canManage,
  onChange,
  compact = false,
}: {
  row: PackageRow;
  canManage: boolean;
  onChange: (id: string, patch: Partial<PackageRow>) => void;
  /** Inside a multi-package block: labels are implied, so drop them. */
  compact?: boolean;
}) {
  const carrierId = `inv-carrier-${row.id}`;
  const trackingId = `inv-tracking-${row.id}`;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <div className="space-y-2">
        {compact ? null : <Label htmlFor={carrierId}>Carrier</Label>}
        <Select
          value={row.carrier}
          onValueChange={(v) => onChange(row.id, { carrier: v as ShippingCarrier })}
          disabled={!canManage}
        >
          <SelectTrigger
            id={carrierId}
            className="w-full"
            aria-label={compact ? "Carrier" : undefined}
          >
            <SelectValue placeholder={CARRIER_LABELS.other} />
          </SelectTrigger>
          <SelectContent>
            {shippingCarriers.map((c) => (
              <SelectItem key={c} value={c}>
                <span className="flex items-center gap-2">
                  <CarrierLogo carrier={c} />
                  {CARRIER_LABELS[c]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {compact ? null : <Label htmlFor={trackingId}>Tracking number</Label>}
        <Input
          id={trackingId}
          value={row.trackingNumber}
          onChange={(e) => onChange(row.id, { trackingNumber: e.target.value })}
          maxLength={120}
          disabled={!canManage}
          placeholder="Carrier tracking number"
          aria-label={compact ? "Tracking number" : undefined}
        />
      </div>
    </div>
  );
}
