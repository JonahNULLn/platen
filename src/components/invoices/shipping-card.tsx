"use client";

import { ExternalLink, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MoneyInput } from "@/components/forms/money-input";
import { CarrierLogo } from "@/components/invoices/carrier-logo";
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
import {
  CARRIER_LABELS,
  type ShippingCarrier,
  shippingCarriers,
  trackingUrl,
} from "@/lib/shipping/carriers";

/**
 * Shipping + tracking on an invoice.
 *
 * The amount is only editable when the quote was written with a capped
 * estimate — that's the one case where the customer was told the figure could
 * still move. Everywhere else the invoice keeps the snapshot it was generated
 * with and only tracking can be added. Neither field is required: an order can
 * ship without a tracking number, or be picked up and never have one.
 */
export function ShippingCard({
  invoiceId,
  mode,
  cap,
  actual,
  billed,
  tracking,
  carrier,
  canManage,
}: {
  invoiceId: string;
  mode: ShippingMode;
  cap: number | null;
  actual: number | null;
  billed: number;
  tracking: string | null;
  carrier: ShippingCarrier;
  canManage: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(actual === null ? "" : String(actual));
  const [trackingNumber, setTrackingNumber] = useState(tracking ?? "");
  const [shippingCarrier, setShippingCarrier] = useState<ShippingCarrier>(carrier);
  const [busy, setBusy] = useState(false);

  // Link straight to the carrier's tracking page. Null for "other" (or a blank
  // number), in which case the number below is rendered as plain text.
  const savedUrl = trackingUrl(carrier, tracking);

  const isEstimate = mode === "estimate";
  const savedAmount = actual === null ? "" : String(actual);
  const dirty =
    amount.trim() !== savedAmount ||
    trackingNumber.trim() !== (tracking ?? "") ||
    shippingCarrier !== carrier;

  const typed = Number(amount);
  const overCap =
    isEstimate && cap !== null && amount.trim() !== "" && Number.isFinite(typed) && typed > cap;

  async function save() {
    if (busy) return;
    setBusy(true);
    const result = await setInvoiceShipping({
      invoiceId,
      shippingActual: isEstimate ? amount.trim() : savedAmount,
      trackingNumber: trackingNumber.trim(),
      shippingCarrier,
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
        {isEstimate ? (
          <div className="space-y-2">
            <Label htmlFor="inv-ship">Actual shipping cost</Label>
            <MoneyInput
              id="inv-ship"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!canManage}
              placeholder={cap === null ? "0.00" : cap.toFixed(2)}
            />
            {overCap ? (
              <p className="text-xs text-destructive">
                Over the {formatCurrency(cap ?? 0)} cap quoted to the customer. Saving bills the
                full amount you enter.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <div className="space-y-2">
            <Label htmlFor="inv-carrier">Carrier</Label>
            <Select
              value={shippingCarrier}
              onValueChange={(v) => setShippingCarrier(v as ShippingCarrier)}
              disabled={!canManage}
            >
              <SelectTrigger id="inv-carrier" className="w-full">
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
            <Label htmlFor="inv-tracking">Tracking number</Label>
            <Input
              id="inv-tracking"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              maxLength={120}
              disabled={!canManage}
              placeholder="Carrier tracking number"
            />
          </div>
        </div>

        {tracking ? (
          <div className="flex items-center gap-2 text-sm">
            <CarrierLogo carrier={carrier} />
            {savedUrl ? (
              <a
                href={savedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
              >
                {tracking}
                <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <span className="text-muted-foreground">{tracking}</span>
            )}
          </div>
        ) : null}

        {canManage ? (
          <Button size="sm" onClick={save} disabled={!dirty || busy} className="gap-1.5">
            {busy ? <Ring size="sm" className="text-current" /> : null}
            Save
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
