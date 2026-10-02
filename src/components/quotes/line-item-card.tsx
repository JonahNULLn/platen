"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Shirt, Trash2 } from "lucide-react";

import { Combobox } from "@/components/common/combobox";
import { MoneyInput } from "@/components/forms/money-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  type CustomSelections,
  customUnitBase,
  defaultSelections,
} from "@/lib/catalog/custom-product";
import { formatCurrency } from "@/lib/format";
import { computeLineTotals } from "@/lib/quotes/totals";
import {
  type BuilderLine,
  type BuilderPlacement,
  type BuilderSize,
  type RefColor,
  type RefColorTier,
  type RefPlacement,
  type RefProduct,
  type VariantMatrix,
  colorTierPrice,
  lineToCalc,
  nextKey,
  productBaseName,
} from "@/lib/quotes/types";
import { cn } from "@/lib/utils";

const NONE_COLOR = "__none__";
const NONE_PLACEMENT = "__none__";

type Props = {
  line: BuilderLine;
  index: number;
  total: number;
  product: RefProduct | undefined;
  colors: RefColor[];
  placements: RefPlacement[];
  colorTiers: RefColorTier[];
  /** Distributor variants for this product line (null = loading or custom). */
  variantMatrix: VariantMatrix | null;
  variantsLoading: boolean;
  /** Flat per-item markup added to a variant's cost to get sell price. */
  markup: number;
  canSeeProfit: boolean;
  onChange: (line: BuilderLine) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function LineItemCard({
  line,
  index,
  total,
  product,
  colors,
  placements,
  colorTiers,
  variantMatrix,
  variantsLoading,
  markup,
  canSeeProfit,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: Props) {
  const totals = computeLineTotals(lineToCalc(line));
  const isProduct = line.itemType === "product";
  const isFee = line.itemType === "fee";
  // Distributor-backed product → variant-driven color + per-size pricing.
  const useVariantColors = isProduct && (variantMatrix?.colors.length ?? 0) > 0;
  // Custom product → priced from its own config (options, color count, …).
  const config = product?.config ?? null;
  const isCustomProduct = isProduct && config !== null;
  const selections: CustomSelections =
    line.customSelections ?? (config ? defaultSelections(config) : { options: {}, colorCount: "" });

  // "Use category instead" toggles the line name between its default
  // (brand + style #, e.g. "Independent Trading Co. SS4500") and the category
  // (e.g. "Hoodie"). Only meaningful for products that have a category.
  const categoryName = product?.categoryName ?? null;
  const baseName = product ? productBaseName(product) : line.name;
  const usingCategory = categoryName !== null && line.name === categoryName;

  function update(patch: Partial<BuilderLine>) {
    onChange({ ...line, ...patch });
  }

  /** Recompute a custom product's unit price from its config + selections —
   *  unless the price was manually edited, which we leave alone. */
  function applyCustom(sel: CustomSelections, qtyStr: string) {
    if (!config) return;
    const qty = Math.trunc(Number(qtyStr) || 0);
    const unitPrice = line.unitPriceOverridden
      ? line.unitPrice
      : customUnitBase(config, qty, sel).toFixed(2);
    onChange({ ...line, quantity: qtyStr, unitPrice, customSelections: sel });
  }
  function setCustomOption(group: string, label: string) {
    applyCustom(
      { ...selections, options: { ...selections.options, [group]: label } },
      line.quantity,
    );
  }
  function setCustomColorCount(value: string) {
    applyCustom({ ...selections, colorCount: value }, line.quantity);
  }

  function updateSize(idx: number, patch: Partial<BuilderSize>) {
    const newSizes = line.sizes.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ ...line, sizes: newSizes });
  }

  /** Pick a distributor color → rebuild size rows from that color's variants,
   *  each priced at cost + markup. Quantities are preserved by size label. */
  function selectVariantColor(color: string) {
    const variants = variantMatrix?.sizesByColor[color] ?? [];
    const qtyBySize = new Map(line.sizes.map((s) => [s.size, s.qty]));
    const sizes: BuilderSize[] = variants.map((v) => ({
      size: v.size,
      qty: qtyBySize.get(v.size) ?? "0",
      unitCost: v.cost === null ? "" : v.cost.toFixed(2),
      unitPrice: v.cost === null ? "0.00" : (v.cost + markup).toFixed(2),
      overridden: false,
    }));
    onChange({ ...line, colorName: color, sizes });
  }

  function updatePlacement(idx: number, patch: Partial<BuilderPlacement>) {
    const newPlacements = line.placements.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange({ ...line, placements: newPlacements });
  }

  function addPlacement() {
    const first = placements[0];
    const colorCount = 1;
    const price = first ? first.defaultPrice + colorTierPrice(colorTiers, colorCount) : 0;
    update({
      placements: [
        ...line.placements,
        {
          key: nextKey("p"),
          placementId: first?.id ?? null,
          placementName: first?.name ?? "",
          colorCount: String(colorCount),
          price: price.toFixed(2),
          inkCostPerColor: first?.inkCostPerColor ?? null,
        },
      ],
    });
  }

  function selectPlacement(idx: number, placementId: string) {
    const placement = placements.find((p) => p.id === placementId);
    if (!placement) return;
    const colorCount = Number(line.placements[idx]?.colorCount) || 0;
    const price = placement.defaultPrice + colorTierPrice(colorTiers, colorCount);
    updatePlacement(idx, {
      placementId: placement.id,
      placementName: placement.name,
      price: price.toFixed(2),
      inkCostPerColor: placement.inkCostPerColor,
    });
  }

  function changePlacementColorCount(idx: number, value: string) {
    const colorCount = Number(value) || 0;
    const placement = placements.find((p) => p.id === line.placements[idx]?.placementId);
    const basePrice = placement?.defaultPrice ?? 0;
    const price = basePrice + colorTierPrice(colorTiers, colorCount);
    updatePlacement(idx, { colorCount: value, price: price.toFixed(2) });
  }

  function removePlacement(idx: number) {
    update({ placements: line.placements.filter((_, i) => i !== idx) });
  }

  const totalQty = totals.quantity;
  const typeLabel = isProduct ? "Product" : isFee ? "Fee" : "Custom";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/40">
            {product?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <Shirt className="size-4 text-muted-foreground/50" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="text-[10px]">
                {typeLabel} · #{index + 1}
              </Badge>
            </div>
            <Input
              value={line.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Item name"
              className="mt-1 h-8 px-2 text-sm font-medium"
            />
            {isProduct && categoryName ? (
              <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={usingCategory}
                  onChange={(e) =>
                    update({ name: e.target.checked ? (categoryName ?? "") : baseName })
                  }
                  className="size-3.5 cursor-pointer"
                />
                Use category instead
              </label>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            className="text-muted-foreground"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            className="text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDuplicate}
            aria-label="Duplicate"
            className="text-muted-foreground"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label="Remove"
            className="text-muted-foreground"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description (product/custom) */}
        {!isFee ? (
          <div className="space-y-2">
            <Label htmlFor={`desc-${line.key}`}>Description</Label>
            <Textarea
              id={`desc-${line.key}`}
              value={line.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              placeholder="Optional notes shown on the quote."
            />
          </div>
        ) : null}

        {/* Color — distributor products use their real variant colors;
            custom items use the tenant's generic color list. */}
        {!isFee && !isCustomProduct ? (
          <div className="space-y-2">
            <Label htmlFor={`color-${line.key}`}>Garment color</Label>
            {isProduct && variantsLoading && !variantMatrix ? (
              <div className="flex h-8 items-center gap-2 text-sm text-muted-foreground">
                <Ring size="sm" className="text-current" /> Loading colors & pricing…
              </div>
            ) : useVariantColors && variantMatrix ? (
              <Combobox
                options={variantMatrix.colors.map((c) => ({ value: c, label: c }))}
                value={line.colorName}
                onChange={selectVariantColor}
                placeholder="Pick a color"
                searchPlaceholder="Search colors…"
                emptyText="No colors."
                className="w-64"
              />
            ) : (
              <Select
                value={line.colorName === "" ? NONE_COLOR : line.colorName}
                onValueChange={(v) => update({ colorName: v === NONE_COLOR ? "" : v })}
              >
                <SelectTrigger id={`color-${line.key}`} className="w-56">
                  <SelectValue placeholder="Pick a color" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_COLOR}>No color selected</SelectItem>
                  {colors.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : null}

        {/* Product sizes — per-variant priced rows once a color is chosen. */}
        {isProduct && !isCustomProduct ? (
          line.sizes.length > 0 ? (
            <div className="space-y-2">
              <Label>Sizes</Label>
              <div
                className={cn(
                  "grid gap-2 text-xs font-medium text-muted-foreground",
                  canSeeProfit ? "grid-cols-[5rem_1fr_1fr_1fr]" : "grid-cols-[6rem_1fr_1fr]",
                )}
              >
                <span>Size</span>
                <span>Qty</span>
                <span>Unit price</span>
                {canSeeProfit ? <span>Cost</span> : null}
              </div>
              {line.sizes.map((s, i) => (
                <div
                  key={s.size}
                  className={cn(
                    "grid items-center gap-2",
                    canSeeProfit ? "grid-cols-[5rem_1fr_1fr_1fr]" : "grid-cols-[6rem_1fr_1fr]",
                  )}
                >
                  <span className="text-sm">{s.size}</span>
                  <Input
                    inputMode="numeric"
                    value={s.qty}
                    onChange={(e) => updateSize(i, { qty: e.target.value })}
                    placeholder="0"
                  />
                  <MoneyInput
                    value={s.unitPrice}
                    onChange={(e) => updateSize(i, { unitPrice: e.target.value, overridden: true })}
                    className={s.overridden ? "border-warning/50" : undefined}
                  />
                  {canSeeProfit ? (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {s.unitCost.trim() === "" ? "—" : formatCurrency(Number(s.unitCost))}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {useVariantColors
                ? "Pick a color to load sizes and pricing."
                : "No sizes available for this product."}
            </p>
          )
        ) : null}

        {/* Simple quantity + unit price (custom + fee lines) */}
        {!isProduct ? (
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor={`feeqty-${line.key}`}>Quantity</Label>
              <Input
                id={`feeqty-${line.key}`}
                inputMode="numeric"
                value={line.quantity}
                onChange={(e) => update({ quantity: e.target.value })}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`feeprice-${line.key}`}>Unit price</Label>
              <MoneyInput
                id={`feeprice-${line.key}`}
                value={line.unitPrice}
                onChange={(e) => update({ unitPrice: e.target.value })}
              />
            </div>
          </div>
        ) : null}

        {/* Custom product — options, color count, methods, computed price */}
        {isCustomProduct && config ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <div className="space-y-2">
                <Label htmlFor={`cpqty-${line.key}`}>Quantity</Label>
                <Input
                  id={`cpqty-${line.key}`}
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(e) => applyCustom(selections, e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`cpprice-${line.key}`}>Unit price</Label>
                <MoneyInput
                  id={`cpprice-${line.key}`}
                  value={line.unitPrice}
                  onChange={(e) =>
                    onChange({ ...line, unitPrice: e.target.value, unitPriceOverridden: true })
                  }
                />
              </div>
            </div>

            {config.blocks.options.on
              ? config.blocks.options.groups.map((g) => (
                  <div key={g.name} className="grid grid-cols-[10rem_1fr] items-center gap-3">
                    <Label>{g.name || "Option"}</Label>
                    <Select
                      value={selections.options[g.name] ?? g.choices[0]?.label ?? ""}
                      onValueChange={(v) => setCustomOption(g.name, v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {g.choices.map((c) => (
                          <SelectItem key={c.label} value={c.label}>
                            {c.label}
                            {Number(c.delta) ? ` (+${formatCurrency(Number(c.delta))})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))
              : null}

            {config.blocks.color.on ? (
              <div className="grid grid-cols-[10rem_8rem] items-center gap-3">
                <Label htmlFor={`cpcolors-${line.key}`}># of colors</Label>
                <Input
                  id={`cpcolors-${line.key}`}
                  inputMode="numeric"
                  value={selections.colorCount}
                  onChange={(e) => setCustomColorCount(e.target.value)}
                  placeholder="1"
                />
              </div>
            ) : null}

            {config.methods.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Production</Label>
                <div className="flex flex-wrap gap-1">
                  {config.methods.map((m) => (
                    <Badge key={m.id} variant="info" className="text-[10px]">
                      {m.name || "Method"}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {config.blocks.size.on || config.blocks.dimension.on || config.blocks.fees.on ? (
              <p className="text-xs text-muted-foreground">
                Per-size, area, and fee pricing for custom products lands in the next step.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Placements (product/custom) */}
        {!isFee && !isCustomProduct ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Placements</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPlacement}
                disabled={placements.length === 0}
                className="gap-1.5"
              >
                <Plus className="size-3.5" /> Add placement
              </Button>
            </div>
            {line.placements.length === 0 ? (
              <p className="text-xs text-muted-foreground">No print locations yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_6rem_8rem_auto] gap-2 text-xs font-medium text-muted-foreground">
                  <span>Placement</span>
                  <span># of colors</span>
                  <span>Price each</span>
                  <span className="w-8" />
                </div>
                {line.placements.map((p, i) => (
                  <div
                    key={p.key}
                    className="grid grid-cols-[1fr_6rem_8rem_auto] items-center gap-2"
                  >
                    <Select
                      value={p.placementId ?? NONE_PLACEMENT}
                      onValueChange={(v) => selectPlacement(i, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a placement" />
                      </SelectTrigger>
                      <SelectContent>
                        {placements.map((pl) => (
                          <SelectItem key={pl.id} value={pl.id}>
                            {pl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      inputMode="numeric"
                      value={p.colorCount}
                      onChange={(e) => changePlacementColorCount(i, e.target.value)}
                      placeholder="1"
                    />
                    <Input
                      inputMode="decimal"
                      value={p.price}
                      onChange={(e) => updatePlacement(i, { price: e.target.value })}
                      placeholder="0.00"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removePlacement(i)}
                      aria-label="Remove placement"
                      className="text-muted-foreground"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : null}

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor={`notes-${line.key}`}>Internal notes</Label>
          <Textarea
            id={`notes-${line.key}`}
            value={line.notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={2}
            placeholder="Production / artwork notes (not shown to customer)."
          />
        </div>

        {/* Per-line summary */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Line subtotal</span>
          <span className="font-semibold tabular-nums">{formatCurrency(totals.totalPrice)}</span>
          {totalQty > 0 ? (
            <span className="text-muted-foreground tabular-nums">
              · {totalQty} {totalQty === 1 ? "unit" : "units"} ·{" "}
              {formatCurrency(totals.totalPrice / totalQty)} per piece
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
