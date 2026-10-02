"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MoneyInput } from "@/components/forms/money-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ring } from "@/components/ui/ring";
import {
  saveColorTiers,
  saveDefaultMarkup,
  saveFees,
  savePlacements,
} from "@/lib/actions/pricing-rules";

type PlacementField = { name: string; defaultPrice: string; inkCostPerColor: string };
type TierField = { colorCount: string; price: string };
type FeeField = { name: string; defaultAmount: string; isPerColor: boolean };

type Props = {
  initialPlacements: PlacementField[];
  initialTiers: TierField[];
  initialFees: FeeField[];
  initialMarkup: string;
};

export function PricingRulesEditor({
  initialPlacements,
  initialTiers,
  initialFees,
  initialMarkup,
}: Props) {
  return (
    <>
      <MarkupCard initial={initialMarkup} />
      <PlacementsCard initial={initialPlacements} />
      <ColorTiersCard initial={initialTiers} />
      <FeesCard initial={initialFees} />
    </>
  );
}

function MarkupCard({ initial }: { initial: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState<string>(initial);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!amount.trim() || Number.isNaN(Number(amount))) {
      toast.error("Markup must be a number");
      return;
    }
    setSaving(true);
    const result = await saveDefaultMarkup(Number(amount));
    setSaving(false);
    if (!result.ok) {
      toast.error("Couldn't save markup", { description: result.error });
      return;
    }
    toast.success("Markup saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-item markup</CardTitle>
        <CardDescription>
          A flat profit amount added on top of each unit's wholesale cost. Drives sell price once
          real distributor pricing is wired. Percent / tiered methods come later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <div className="w-44 space-y-2">
            <Label htmlFor="markup-amount">Amount</Label>
            <MoneyInput
              id="markup-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Ring size="sm" className="text-current" /> : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlacementsCard({ initial }: { initial: PlacementField[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<PlacementField[]>(initial);
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<PlacementField>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    for (const r of rows) {
      if (!r.name.trim()) {
        toast.error("Each placement needs a name");
        return;
      }
      if (r.defaultPrice.trim() !== "" && Number.isNaN(Number(r.defaultPrice))) {
        toast.error("Placement prices must be numbers");
        return;
      }
      if (r.inkCostPerColor.trim() !== "" && Number.isNaN(Number(r.inkCostPerColor))) {
        toast.error("Ink costs must be numbers");
        return;
      }
    }
    setSaving(true);
    const result = await savePlacements(
      rows.map((r) => ({
        name: r.name.trim(),
        defaultPrice: r.defaultPrice.trim() === "" ? 0 : Number(r.defaultPrice),
        inkCostPerColor: r.inkCostPerColor.trim() === "" ? 0 : Number(r.inkCostPerColor),
      })),
    );
    setSaving(false);
    if (!result.ok) {
      toast.error("Couldn't save placements", { description: result.error });
      return;
    }
    toast.success("Placements saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Placements</CardTitle>
        <CardDescription>
          Where decoration can go on a garment. The base price is what you charge, added on top of
          color-count pricing. Ink cost is what one ink color costs you per print here — it never
          appears on quotes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_8rem_8rem_auto] gap-2 text-xs font-medium text-muted-foreground">
          <span>Name</span>
          <span>Base price</span>
          <span>Ink cost / color</span>
          <span className="w-8" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No placements yet.</p>
        ) : (
          rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional rows, no stable id
            <div key={i} className="grid grid-cols-[1fr_8rem_8rem_auto] items-center gap-2">
              <Input
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Front Center"
              />
              <MoneyInput
                value={row.defaultPrice}
                onChange={(e) => update(i, { defaultPrice: e.target.value })}
              />
              <MoneyInput
                value={row.inkCostPerColor}
                onChange={(e) => update(i, { inkCostPerColor: e.target.value })}
                placeholder="0.0000"
                aria-label="Ink cost per color"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove placement"
                className="text-muted-foreground"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setRows((prev) => [...prev, { name: "", defaultPrice: "0", inkCostPerColor: "0" }])
            }
          >
            <Plus className="size-4" /> Add placement
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Ring size="sm" className="text-current" /> : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ColorTiersCard({ initial }: { initial: TierField[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<TierField[]>(initial);
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<TierField>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    const counts = new Set<number>();
    for (const r of rows) {
      const count = Number(r.colorCount);
      if (!r.colorCount.trim() || !Number.isInteger(count) || count < 1) {
        toast.error("Color count must be a whole number of 1 or more");
        return;
      }
      if (counts.has(count)) {
        toast.error(`Color count ${count} is listed twice`);
        return;
      }
      counts.add(count);
      if (!r.price.trim() || Number.isNaN(Number(r.price))) {
        toast.error("Each tier needs a valid price");
        return;
      }
    }
    setSaving(true);
    const result = await saveColorTiers(
      rows.map((r) => ({ colorCount: Number(r.colorCount), price: Number(r.price) })),
    );
    setSaving(false);
    if (!result.ok) {
      toast.error("Couldn't save color tiers", { description: result.error });
      return;
    }
    toast.success("Color tiers saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color count pricing</CardTitle>
        <CardDescription>Price per garment, per location, by number of ink colors.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[8rem_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
          <span># of colors</span>
          <span>Price each</span>
          <span className="w-8" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tiers yet.</p>
        ) : (
          rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional rows, no stable id
            <div key={i} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
              <Input
                inputMode="numeric"
                value={row.colorCount}
                onChange={(e) => update(i, { colorCount: e.target.value })}
                placeholder="1"
              />
              <MoneyInput
                value={row.price}
                onChange={(e) => update(i, { price: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove tier"
                className="text-muted-foreground"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setRows((prev) => [...prev, { colorCount: "", price: "" }])}
          >
            <Plus className="size-4" /> Add tier
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Ring size="sm" className="text-current" /> : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FeesCard({ initial }: { initial: FeeField[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<FeeField[]>(initial);
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<FeeField>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    for (const r of rows) {
      if (!r.name.trim()) {
        toast.error("Each fee needs a name");
        return;
      }
      if (r.defaultAmount.trim() !== "" && Number.isNaN(Number(r.defaultAmount))) {
        toast.error("Fee amounts must be numbers");
        return;
      }
    }
    setSaving(true);
    const result = await saveFees(
      rows.map((r) => ({
        name: r.name.trim(),
        defaultAmount: r.defaultAmount.trim() === "" ? 0 : Number(r.defaultAmount),
        isPerColor: r.isPerColor,
      })),
    );
    setSaving(false);
    if (!result.ok) {
      toast.error("Couldn't save fees", { description: result.error });
      return;
    }
    toast.success("Fees saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fees</CardTitle>
        <CardDescription>Standard charges available when building quotes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_8rem_auto_auto] gap-2 text-xs font-medium text-muted-foreground">
          <span>Name</span>
          <span>Amount</span>
          <span className="whitespace-nowrap">Per color</span>
          <span className="w-8" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fees yet.</p>
        ) : (
          rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional rows, no stable id
            <div key={i} className="grid grid-cols-[1fr_8rem_auto_auto] items-center gap-2">
              <Input
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Screen fee"
              />
              <MoneyInput
                value={row.defaultAmount}
                onChange={(e) => update(i, { defaultAmount: e.target.value })}
              />
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={row.isPerColor}
                  onChange={(e) => update(i, { isPerColor: e.target.checked })}
                  aria-label="Per color"
                  className="size-4 cursor-pointer"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove fee"
                className="text-muted-foreground"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setRows((prev) => [...prev, { name: "", defaultAmount: "0", isPerColor: false }])
            }
          >
            <Plus className="size-4" /> Add fee
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Ring size="sm" className="text-current" /> : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
