"use client";

import { Send } from "lucide-react";

import { MoneyInput } from "@/components/forms/money-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency } from "@/lib/format";
import { type ShippingMode, shippingModes } from "@/lib/quotes/shipping";
import { SHIPPING_MODE_HINTS, SHIPPING_MODE_LABELS } from "@/lib/quotes/shipping";
import { computeQuoteTotals } from "@/lib/quotes/totals";
import { type BuilderLine, lineToCalc } from "@/lib/quotes/types";

export type AdjustmentsSlice = {
  discountType: "amount" | "percent";
  discountValue: string;
  shippingAmount: string;
  shippingMode: ShippingMode;
  depositType: "amount" | "percent";
  depositValue: string;
  taxRate: number; // decimal, e.g. 0.0925
  isTaxExempt: boolean;
};

type Props = {
  lines: BuilderLine[];
  adjustments: AdjustmentsSlice;
  onChange: (patch: Partial<AdjustmentsSlice>) => void;
  canSeeProfit: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  onSaveAndSend: () => void;
};

const num = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function TotalsSidebar({
  lines,
  adjustments,
  onChange,
  canSeeProfit,
  saving,
  onSaveDraft,
  onSaveAndSend,
}: Props) {
  const totals = computeQuoteTotals(lines.map(lineToCalc), {
    discountType: adjustments.discountType,
    discountValue: num(adjustments.discountValue),
    depositType: adjustments.depositType,
    depositValue: num(adjustments.depositValue),
    shippingAmount: num(adjustments.shippingAmount),
    taxRate: adjustments.taxRate,
    isTaxExempt: adjustments.isTaxExempt,
  });

  // Tax rate input shown as percent (9.25), stored as decimal (0.0925).
  const taxPercent = (adjustments.taxRate * 100).toFixed(2);

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle>Totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Discount */}
        <div className="space-y-2">
          <Label>Discount</Label>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Input
              inputMode="decimal"
              value={adjustments.discountValue}
              onChange={(e) => onChange({ discountValue: e.target.value })}
              placeholder="0.00"
            />
            <Select
              value={adjustments.discountType}
              onValueChange={(v) => onChange({ discountType: v as "amount" | "percent" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">$</SelectItem>
                <SelectItem value="percent">%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Shipping — the mode picker doubles as this section's heading, so
            there's no separate "Shipping" label above it. */}
        <div className="space-y-2">
          <Label htmlFor="qt-shipping-mode" className="sr-only">
            Shipping
          </Label>
          <Select
            value={adjustments.shippingMode}
            onValueChange={(v) => onChange({ shippingMode: v as ShippingMode })}
          >
            <SelectTrigger id="qt-shipping-mode" className="w-full">
              <SelectValue placeholder={SHIPPING_MODE_LABELS.standard} />
            </SelectTrigger>
            <SelectContent>
              {shippingModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {SHIPPING_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <MoneyInput
            id="qt-shipping"
            value={adjustments.shippingAmount}
            onChange={(e) => onChange({ shippingAmount: e.target.value })}
            placeholder={adjustments.shippingMode === "estimate" ? "0.00 CAPPED" : "0.00"}
          />
          {adjustments.shippingMode === "estimate" ? (
            <p className="text-xs text-muted-foreground">{SHIPPING_MODE_HINTS.estimate}</p>
          ) : null}
        </div>

        {/* Tax rate (exempt toggle lives on the customer section) */}
        <div className="space-y-2">
          <Label htmlFor="qt-tax">Tax rate (%)</Label>
          <Input
            id="qt-tax"
            inputMode="decimal"
            value={taxPercent}
            onChange={(e) => onChange({ taxRate: (num(e.target.value) || 0) / 100 })}
            placeholder="0.00"
            disabled={adjustments.isTaxExempt}
          />
          {adjustments.isTaxExempt ? (
            <p className="text-xs text-muted-foreground">Tax exempt is on — no tax applied.</p>
          ) : null}
        </div>

        {/* Deposit */}
        <div className="space-y-2">
          <Label>Deposit required</Label>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Input
              inputMode="decimal"
              value={adjustments.depositValue}
              onChange={(e) => onChange({ depositValue: e.target.value })}
              placeholder="0.00"
            />
            <Select
              value={adjustments.depositType}
              onValueChange={(v) => onChange({ depositType: v as "amount" | "percent" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">$</SelectItem>
                <SelectItem value="percent">%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Computed totals */}
        <div className="space-y-1.5 border-t border-border pt-3 text-sm">
          <Row label="Subtotal" value={formatCurrency(totals.subtotal)} />
          {totals.discountAmount > 0 ? (
            <Row label="Discount" value={`− ${formatCurrency(totals.discountAmount)}`} />
          ) : null}
          {totals.taxAmount > 0 ? (
            <Row label="Tax" value={formatCurrency(totals.taxAmount)} />
          ) : null}
          {totals.shippingAmount > 0 ? (
            <Row label="Shipping" value={formatCurrency(totals.shippingAmount)} />
          ) : null}
          <Row label="Total" value={formatCurrency(totals.total)} bold />
          {totals.depositAmount > 0 ? (
            <Row label="Deposit due" value={formatCurrency(totals.depositAmount)} />
          ) : null}
        </div>

        {/* Internal — owner/admin only */}
        {canSeeProfit ? (
          <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="font-medium uppercase tracking-wide text-muted-foreground">
              Internal
            </div>
            <Row label="Cost" value={formatCurrency(totals.cost)} small />
            <Row label="Profit" value={formatCurrency(totals.profit)} small />
            <Row label="Margin" value={`${totals.marginPct.toFixed(1)}%`} small />
          </div>
        ) : null}

        {/* Actions */}
        <div className="space-y-2 border-t border-border pt-3">
          <Button onClick={onSaveDraft} disabled={saving} variant="outline" className="w-full">
            {saving ? <Ring size="sm" className="text-current" /> : "Save draft"}
          </Button>
          <Button onClick={onSaveAndSend} disabled={saving} className="w-full gap-1.5">
            {saving ? (
              <Ring size="sm" className="text-current" />
            ) : (
              <>
                <Send className="size-4" /> Save and send
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  bold,
  small,
}: {
  label: string;
  value: string;
  bold?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={small ? "text-muted-foreground" : "text-muted-foreground"}>{label}</span>
      <span
        className={`tabular-nums ${bold ? "text-base font-semibold text-foreground" : ""} ${small ? "" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
