"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ring } from "@/components/ui/ring";
import { setInvoicePurchaseOrder } from "@/lib/actions/invoices";

/**
 * The customer's PO number on an invoice. The same value lives on the source
 * quote — saving here writes through to it, so the two documents can never
 * show different purchase orders.
 */
export function PurchaseOrderCard({
  invoiceId,
  value,
  canManage,
}: {
  invoiceId: string;
  value: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [po, setPo] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  const saved = value ?? "";
  const dirty = po.trim() !== saved;

  async function save() {
    if (busy) return;
    setBusy(true);
    const result = await setInvoicePurchaseOrder({ invoiceId, purchaseOrder: po.trim() });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Purchase order saved");
    router.refresh();
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Purchase order</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {saved === "" ? <span className="text-muted-foreground">None</span> : saved}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchase order</CardTitle>
        <CardDescription>Shared with the quote — saving updates both.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="inv-po" className="sr-only">
            Purchase order
          </Label>
          <Input
            id="inv-po"
            value={po}
            onChange={(e) => setPo(e.target.value)}
            maxLength={60}
            placeholder="Customer's PO number"
          />
        </div>
        <Button size="sm" onClick={save} disabled={!dirty || busy} className="gap-1.5">
          {busy ? <Ring size="sm" className="text-current" /> : null}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
