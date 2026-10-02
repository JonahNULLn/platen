"use client";

import { ChevronDown, Eye, FileText, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { CustomerSection, type CustomerSlice } from "@/components/quotes/customer-section";
import { LineItemCard } from "@/components/quotes/line-item-card";
import { ProductPickerDialog } from "@/components/quotes/product-picker-dialog";
import { QuotePdfPreviewSheet } from "@/components/quotes/quote-pdf-preview-sheet";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { type AdjustmentsSlice, TotalsSidebar } from "@/components/quotes/totals-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getProductVariantMatrix, saveQuote } from "@/lib/actions/quotes";
import { customUnitBase, defaultSelections } from "@/lib/catalog/custom-product";
import { formatCurrency } from "@/lib/format";
import { type PaymentInstallment, scheduleFor } from "@/lib/payments/payment-terms";
import { type PdfOrg, pdfQuoteFromBuilder } from "@/lib/pdf/snapshot";
import { addressesForSave } from "@/lib/quotes/customer-address";
import { computeQuoteTotals } from "@/lib/quotes/totals";
import {
  type BuilderLine,
  type QuoteRefData,
  type RefCustomer,
  type RefFee,
  type RefPaymentTerm,
  type RefProduct,
  type VariantMatrix,
  lineToCalc,
  nextKey,
  productBaseName,
} from "@/lib/quotes/types";

export type MetaSlice = {
  quoteDate: string;
  expiresAt: string;
  /** Customer's PO number. Shared with the invoice generated from this quote. */
  purchaseOrder: string;
  notes: string;
  internalNotes: string;
  terms: string;
  paymentTerms: string;
  paymentMethodDefault: string;
  /** Installments snapshotted from the chosen payment term; null when none. */
  paymentSchedule: PaymentInstallment[] | null;
};

export type QuoteBuilderInitial = {
  customer: CustomerSlice;
  adjustments: AdjustmentsSlice;
  meta: MetaSlice;
  lines: BuilderLine[];
};

type Props = {
  refData: QuoteRefData;
  org: PdfOrg;
  quoteId?: string;
  initial?: QuoteBuilderInitial;
  existing?: {
    quoteNumber: string;
    version: number;
    status: string;
    approvedByName: string | null;
  };
  detailActions?: React.ReactNode;
};

const PAYMENT_METHODS = ["Cash", "Check", "Card", "ACH", "Other"];
/** Every quote states how it will be paid, so there is no "none" option. */
const DEFAULT_PAYMENT_METHOD = "Check";

/**
 * The PDF renderer lives in its own client chunk (no SSR) and is only mounted
 * while the Preview Sheet is open — pre-rendering it in the background while
 * the user edits was eating CPU on every change in dev mode. Cost is moved
 * back to "first click after page load," softened by the Sheet's loading
 * spinner.
 */
const QuotePdfBlobRenderer = dynamic(
  () => import("@/components/quotes/quote-pdf-blob-renderer").then((m) => m.QuotePdfBlobRenderer),
  { ssr: false },
);

function emptyCustomer(): CustomerSlice {
  return {
    customerId: null,
    name: "",
    company: "",
    email: "",
    phone: "",
    billingLine1: "",
    billingLine2: "",
    billingCity: "",
    billingState: "",
    billingPostalCode: "",
    billingCountry: "US",
    shippingSameAsBilling: true,
    shipLine1: "",
    shipLine2: "",
    shipCity: "",
    shipState: "",
    shipPostalCode: "",
    shipCountry: "US",
    billToEmail: "",
    isTaxExempt: false,
    customerTaxExemptId: "",
  };
}

/** New-quote meta, pre-selecting the org's default payment term if one exists. */
function emptyMeta(terms: RefPaymentTerm[]): MetaSlice {
  const def = terms.find((t) => t.isDefault) ?? terms[0];
  return {
    quoteDate: new Date().toISOString().slice(0, 10),
    expiresAt: "",
    purchaseOrder: "",
    notes: "",
    internalNotes: "",
    terms: "",
    paymentTerms: def?.name ?? "",
    paymentMethodDefault: DEFAULT_PAYMENT_METHOD,
    paymentSchedule: def ? def.installments.map((i) => ({ ...i })) : null,
  };
}

function emptyAdjustments(defaultTaxRate: number, isTaxExempt: boolean): AdjustmentsSlice {
  return {
    shippingMode: "standard",
    discountType: "amount",
    discountValue: "0",
    shippingAmount: "0",
    depositType: "amount",
    depositValue: "0",
    taxRate: defaultTaxRate,
    isTaxExempt,
  };
}

/** A fresh product line — colorless and sizeless. Colors/sizes/pricing get
 *  populated from the lazily-loaded variant matrix once a color is picked. */
function newProductLine(product: RefProduct): BuilderLine {
  return {
    key: nextKey("line"),
    itemType: "product",
    tenantProductId: product.id,
    name: productBaseName(product),
    description: "",
    colorName: "",
    notes: "",
    unitPrice: "0",
    unitCost: "",
    quantity: "0",
    sizes: [],
    placements: [],
  };
}

/** A custom product line — seeded from the product's base price + default
 *  option selections. No distributor variant matrix. */
function newCustomProductLine(product: RefProduct): BuilderLine {
  const config = product.config;
  const qty = product.minQuantity ?? 1;
  const sel = config ? defaultSelections(config) : { options: {}, colorCount: "" };
  const unit = config ? customUnitBase(config, qty, sel) : 0;
  return {
    key: nextKey("line"),
    itemType: "product",
    tenantProductId: product.id,
    name: product.name,
    description: "",
    colorName: "",
    notes: "",
    unitPrice: unit.toFixed(2),
    unitCost: "",
    quantity: String(qty),
    sizes: [],
    placements: [],
    customSelections: sel,
  };
}

function newCustomLine(): BuilderLine {
  return {
    key: nextKey("line"),
    itemType: "custom",
    tenantProductId: null,
    name: "Custom item",
    description: "",
    colorName: "",
    notes: "",
    unitPrice: "0",
    unitCost: "",
    quantity: "1",
    sizes: [],
    placements: [],
  };
}

function newFeeLine(fee: RefFee): BuilderLine {
  return {
    key: nextKey("line"),
    itemType: "fee",
    tenantProductId: null,
    name: fee.name,
    description: "",
    colorName: "",
    notes: "",
    unitPrice: fee.defaultAmount.toFixed(2),
    unitCost: "",
    quantity: "1",
    sizes: [],
    placements: [],
  };
}

export function QuoteBuilder({ refData, org, quoteId, initial, existing, detailActions }: Props) {
  const router = useRouter();

  const [customer, setCustomer] = useState<CustomerSlice>(initial?.customer ?? emptyCustomer());
  const [adjustments, setAdjustments] = useState<AdjustmentsSlice>(
    initial?.adjustments ?? emptyAdjustments(refData.defaultTaxRate, false),
  );
  const [meta, setMeta] = useState<MetaSlice>(initial?.meta ?? emptyMeta(refData.paymentTerms));
  const [lines, setLines] = useState<BuilderLine[]>(initial?.lines ?? []);
  const [saving, setSaving] = useState(false);
  // The quote's id once it exists. Starts from the edit prop and is set after
  // the first create, so a follow-up save (e.g. draft → send) updates that
  // quote instead of creating a duplicate — the /quotes/new instance stays
  // mounted while navigation to the detail page is still in flight.
  const [savedId, setSavedId] = useState<string | undefined>(quoteId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  // Lazily-loaded distributor variant matrices, keyed by tenant product id.
  const [variantMatrices, setVariantMatrices] = useState<Map<string, VariantMatrix>>(new Map());
  const [loadingVariants, setLoadingVariants] = useState<Set<string>>(new Set());

  /** Fetch a product's variant matrix once (skips if already loaded/loading). */
  const ensureMatrix = useCallback(
    (tenantProductId: string) => {
      if (variantMatrices.has(tenantProductId) || loadingVariants.has(tenantProductId)) return;
      setLoadingVariants((l) => new Set(l).add(tenantProductId));
      getProductVariantMatrix(tenantProductId).then((matrix) => {
        setVariantMatrices((m) => new Map(m).set(tenantProductId, matrix));
        setLoadingVariants((l) => {
          const n = new Set(l);
          n.delete(tenantProductId);
          return n;
        });
      });
    },
    [variantMatrices, loadingVariants],
  );

  // Load matrices for any product lines present on mount (edit mode).
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    for (const line of lines) {
      if (line.tenantProductId) ensureMatrix(line.tenantProductId);
    }
  }, []);
  // Snapshot the quote state at the moment Preview opens, then pass that
  // frozen object to the renderer. Without freezing, the renderer's own
  // blob-URL callback re-renders the parent, which produces a NEW pdfSnapshot
  // object (same data, different reference), which trips the renderer into
  // another render — the visible "flashing" loop while the Sheet is open.
  const [frozenPdfSnapshot, setFrozenPdfSnapshot] = useState<ReturnType<
    typeof pdfQuoteFromBuilder
  > | null>(null);

  /** PDF snapshot built fresh on every render — fed to the background blob
   * renderer (debounced) so opening the Preview Sheet just shows the latest
   * already-rendered PDF. */
  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const pdfSnapshot = pdfQuoteFromBuilder(
    {
      number: existing?.quoteNumber ?? "DRAFT",
      status: existing?.status ?? "draft",
      quoteDate: meta.quoteDate,
      expiresAt: meta.expiresAt,
      purchaseOrder: meta.purchaseOrder,
      approvedBy: existing?.approvedByName ?? null,
      customer: {
        name: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
        billToSameAsShipping: customer.shippingSameAsBilling,
        billToLine1: customer.billingLine1,
        billToLine2: customer.billingLine2,
        billToCity: customer.billingCity,
        billToState: customer.billingState,
        billToPostalCode: customer.billingPostalCode,
        billToCountry: customer.billingCountry,
        billToEmail: customer.billToEmail,
        // Shipping side of the preview: the billing address when they match.
        addressLine1: customer.shippingSameAsBilling ? customer.billingLine1 : customer.shipLine1,
        addressLine2: customer.shippingSameAsBilling ? customer.billingLine2 : customer.shipLine2,
        city: customer.shippingSameAsBilling ? customer.billingCity : customer.shipCity,
        state: customer.shippingSameAsBilling ? customer.billingState : customer.shipState,
        postalCode: customer.shippingSameAsBilling
          ? customer.billingPostalCode
          : customer.shipPostalCode,
        country: customer.shippingSameAsBilling ? customer.billingCountry : customer.shipCountry,
      },
      lines,
      adjustments: {
        discountType: adjustments.discountType,
        discountValue: num(adjustments.discountValue),
        shippingAmount: num(adjustments.shippingAmount),
        shippingMode: adjustments.shippingMode,
        depositType: adjustments.depositType,
        depositValue: num(adjustments.depositValue),
        taxRate: adjustments.taxRate,
        isTaxExempt: customer.isTaxExempt,
      },
      paymentMethod: meta.paymentMethodDefault,
      paymentTerms: meta.paymentTerms,
      terms: meta.terms,
      notes: meta.notes,
    },
    org,
  );

  function openPreview() {
    // Always re-render fresh so the user sees the latest state, never a stale
    // URL from a previous open. Freeze the current snapshot so subsequent
    // re-renders of this component don't perturb the open preview.
    setPdfBlobUrl(null);
    setFrozenPdfSnapshot(pdfSnapshot);
    setPreviewOpen(true);
  }

  function handlePreviewOpenChange(open: boolean) {
    setPreviewOpen(open);
    if (!open) setFrozenPdfSnapshot(null);
  }

  function updateCustomer(patch: Partial<CustomerSlice>) {
    setCustomer((prev) => ({ ...prev, ...patch }));
    if (patch.isTaxExempt !== undefined) {
      const exempt = patch.isTaxExempt;
      setAdjustments((prev) => ({ ...prev, isTaxExempt: exempt }));
    }
  }
  function updateAdjustments(patch: Partial<AdjustmentsSlice>) {
    setAdjustments((prev) => ({ ...prev, ...patch }));
  }
  function updateMeta(patch: Partial<MetaSlice>) {
    setMeta((prev) => ({ ...prev, ...patch }));
  }
  /** Apply a picked customer's default payment term to the quote (resolving its
   *  installments from the org's saved terms). No-op if they have none set. */
  function applyCustomerDefaults(c: RefCustomer) {
    const termName = c.defaultPaymentTerms?.trim();
    if (!termName) return;
    const term = refData.paymentTerms.find((t) => t.name === termName);
    updateMeta({
      paymentTerms: termName,
      paymentSchedule: term ? term.installments.map((i) => ({ ...i })) : null,
    });
  }
  function updateLine(index: number, line: BuilderLine) {
    setLines((prev) => prev.map((l, i) => (i === index ? line : l)));
  }
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }
  function duplicateLine(index: number) {
    setLines((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const copy: BuilderLine = {
        ...source,
        key: nextKey("line"),
        sizes: source.sizes.map((s) => ({ ...s })),
        placements: source.placements.map((p) => ({ ...p, key: nextKey("p") })),
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }
  function moveLine(index: number, dir: -1 | 1) {
    setLines((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      const other = next[target];
      if (!tmp || !other) return prev;
      next[index] = other;
      next[target] = tmp;
      return next;
    });
  }

  function addProduct(product: RefProduct) {
    if (product.config) {
      // Custom product — priced from its config, no distributor variants.
      setLines((prev) => [...prev, newCustomProductLine(product)]);
      return;
    }
    setLines((prev) => [...prev, newProductLine(product)]);
    ensureMatrix(product.id);
  }
  function addCustom() {
    setLines((prev) => [...prev, newCustomLine()]);
  }
  function addFee(fee: RefFee) {
    setLines((prev) => [...prev, newFeeLine(fee)]);
  }

  async function persist(send: boolean) {
    if (saving) return;
    setSaving(true);
    const num = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const result = await saveQuote(
      savedId ?? null,
      {
        customerId: customer.customerId,
        customerName: customer.name.trim() === "" ? null : customer.name.trim(),
        customerCompany: customer.company.trim() === "" ? null : customer.company.trim(),
        customerEmail: customer.email.trim() === "" ? null : customer.email.trim(),
        customerPhone: customer.phone.trim() === "" ? null : customer.phone.trim(),
        ...addressesForSave(customer),
        billToEmail: customer.billToEmail.trim() === "" ? null : customer.billToEmail.trim(),
        customerTaxExemptId:
          customer.customerTaxExemptId.trim() === "" ? null : customer.customerTaxExemptId.trim(),
        quoteDate: meta.quoteDate,
        expiresAt: meta.expiresAt.trim() === "" ? null : meta.expiresAt,
        purchaseOrder: meta.purchaseOrder.trim() === "" ? null : meta.purchaseOrder.trim(),
        isTaxExempt: customer.isTaxExempt,
        taxRate: adjustments.taxRate,
        shippingAmount: num(adjustments.shippingAmount),
        shippingMode: adjustments.shippingMode,
        discountType: adjustments.discountType,
        discountValue: num(adjustments.discountValue),
        depositType: adjustments.depositType,
        depositValue: num(adjustments.depositValue),
        notes: meta.notes.trim() === "" ? null : meta.notes.trim(),
        internalNotes: meta.internalNotes.trim() === "" ? null : meta.internalNotes.trim(),
        terms: meta.terms.trim() === "" ? null : meta.terms.trim(),
        paymentTerms: meta.paymentTerms.trim() === "" ? null : meta.paymentTerms.trim(),
        paymentMethodDefault: meta.paymentMethodDefault.trim() || DEFAULT_PAYMENT_METHOD,
        paymentSchedule: meta.paymentSchedule,
        lineItems: lines.map((line) => ({
          tenantProductId: line.tenantProductId,
          itemType: line.itemType,
          name: line.name.trim() || "Untitled item",
          description: line.description.trim() === "" ? null : line.description.trim(),
          quantity: Math.trunc(num(line.quantity)),
          unitPrice: num(line.unitPrice),
          unitCost: line.unitCost.trim() === "" ? null : num(line.unitCost),
          colorName: line.colorName.trim() === "" ? null : line.colorName.trim(),
          notes: line.notes.trim() === "" ? null : line.notes.trim(),
          sizesBreakdown:
            line.sizes.length > 0
              ? line.sizes.map((s) => ({
                  size: s.size,
                  qty: Math.trunc(num(s.qty)),
                  unitPrice: num(s.unitPrice),
                  unitCost: s.unitCost.trim() === "" ? null : num(s.unitCost),
                  overridden: s.overridden,
                  costOverridden: s.costOverridden,
                }))
              : null,
          placementsData:
            line.placements.length > 0
              ? line.placements.map((p) => ({
                  placementId: p.placementId,
                  placementName: p.placementName,
                  colorCount: Math.trunc(num(p.colorCount)),
                  price: num(p.price),
                  inkCostPerColor: p.inkCostPerColor,
                }))
              : null,
        })),
      },
      { send },
    );

    setSaving(false);
    if (!result.ok) {
      toast.error(send ? "Couldn't send quote" : "Couldn't save quote", {
        description: result.error,
      });
      return;
    }

    toast.success(send ? "Quote sent" : "Quote saved");
    if (savedId) {
      router.refresh();
    } else {
      setSavedId(result.id);
      router.push(`/quotes/${result.id}`);
    }
  }

  const NO_TERM = "__no_term__";

  /** Snapshot the chosen term's installments onto the quote (name + schedule). */
  function selectPaymentTerm(value: string) {
    if (value === NO_TERM) {
      updateMeta({ paymentTerms: "", paymentSchedule: null });
      return;
    }
    const term = refData.paymentTerms.find((t) => t.name === value);
    if (!term) return;
    updateMeta({
      paymentTerms: term.name,
      paymentSchedule: term.installments.map((i) => ({ ...i })),
    });
  }

  // Order total drives the payment-schedule preview (deposit excluded — the
  // schedule is its own breakdown of what's collected and when).
  const orderTotal = computeQuoteTotals(lines.map(lineToCalc), {
    discountType: adjustments.discountType,
    discountValue: Number(adjustments.discountValue) || 0,
    depositType: adjustments.depositType,
    depositValue: Number(adjustments.depositValue) || 0,
    shippingAmount: Number(adjustments.shippingAmount) || 0,
    taxRate: adjustments.taxRate,
    isTaxExempt: adjustments.isTaxExempt,
  }).total;
  const schedulePreview = meta.paymentSchedule
    ? scheduleFor(
        { id: "", name: "", isDefault: false, installments: meta.paymentSchedule },
        orderTotal,
      )
    : [];

  return (
    <>
      <PageHeader
        title={existing ? `Quote ${existing.quoteNumber}` : "New quote"}
        subtitle={
          existing ? (
            <span className="flex items-center gap-2">
              <QuoteStatusBadge status={existing.status} />
              {existing.version > 1 ? (
                <span className="text-xs">Version {existing.version}</span>
              ) : null}
            </span>
          ) : (
            "Build and price a quote for a customer."
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openPreview} className="gap-1.5">
              <Eye className="size-4" /> Preview
            </Button>
            {detailActions}
          </div>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: customer + metadata */}
        <div className="space-y-6 lg:w-80 lg:shrink-0">
          <CustomerSection
            value={customer}
            onChange={updateCustomer}
            customers={refData.customers}
            onSelectCustomer={applyCustomerDefaults}
          />

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Dates, notes, terms, and how they'll pay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="q-date">Quote date</Label>
                  <Input
                    id="q-date"
                    type="date"
                    value={meta.quoteDate}
                    onChange={(e) => updateMeta({ quoteDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="q-exp">Expires</Label>
                  <Input
                    id="q-exp"
                    type="date"
                    value={meta.expiresAt}
                    onChange={(e) => updateMeta({ expiresAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-payment-method">Payment method</Label>
                <Select
                  value={meta.paymentMethodDefault || DEFAULT_PAYMENT_METHOD}
                  onValueChange={(v) => updateMeta({ paymentMethodDefault: v })}
                >
                  <SelectTrigger id="q-payment-method" className="w-full">
                    <SelectValue placeholder={DEFAULT_PAYMENT_METHOD} />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-payment-terms">Payment terms</Label>
                <Select
                  value={
                    meta.paymentTerms &&
                    refData.paymentTerms.some((t) => t.name === meta.paymentTerms)
                      ? meta.paymentTerms
                      : NO_TERM
                  }
                  onValueChange={selectPaymentTerm}
                >
                  <SelectTrigger id="q-payment-terms">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TERM}>None</SelectItem>
                    {refData.paymentTerms.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {schedulePreview.length > 0 ? (
                  <ul className="space-y-0.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs">
                    {schedulePreview.map((inst) => (
                      <li key={inst.id} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {inst.label || "Installment"} · {inst.dueLabel}
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatCurrency(inst.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-po">Purchase order</Label>
                <Input
                  id="q-po"
                  value={meta.purchaseOrder}
                  onChange={(e) => updateMeta({ purchaseOrder: e.target.value })}
                  maxLength={60}
                  placeholder="Customer's PO number"
                />
                <p className="text-xs text-muted-foreground">
                  Shown on the quote and the invoice — editing it in either place updates both.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-notes">Customer-facing notes</Label>
                <Textarea
                  id="q-notes"
                  value={meta.notes}
                  onChange={(e) => updateMeta({ notes: e.target.value })}
                  rows={3}
                  placeholder="Shown on the quote."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-internal">Internal notes</Label>
                <Textarea
                  id="q-internal"
                  value={meta.internalNotes}
                  onChange={(e) => updateMeta({ internalNotes: e.target.value })}
                  rows={2}
                  placeholder="Not shown to the customer."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-terms">Terms</Label>
                <Textarea
                  id="q-terms"
                  value={meta.terms}
                  onChange={(e) => updateMeta({ terms: e.target.value })}
                  rows={4}
                  placeholder="Conditions printed on the quote (validity, deposit, artwork approval, etc.)."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center: line items */}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Line items</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" /> Add line item
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setPickerOpen(true)}>Product…</DropdownMenuItem>
                <DropdownMenuItem onClick={addCustom}>Custom item</DropdownMenuItem>
                {refData.fees.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Fees
                    </DropdownMenuLabel>
                    {refData.fees.map((fee) => (
                      <DropdownMenuItem key={fee.id} onClick={() => addFee(fee)}>
                        {fee.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {lines.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="rounded-full bg-muted/40 p-3">
                  <FileText className="size-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">No line items yet</div>
                  <p className="text-xs text-muted-foreground">
                    Add a product, custom item, or fee to start pricing this quote.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            lines.map((line, i) => (
              <LineItemCard
                key={line.key}
                line={line}
                index={i}
                total={lines.length}
                product={
                  line.tenantProductId
                    ? refData.products.find((p) => p.id === line.tenantProductId)
                    : undefined
                }
                colors={refData.colors}
                placements={refData.placements}
                colorTiers={refData.colorTiers}
                variantMatrix={
                  line.tenantProductId ? (variantMatrices.get(line.tenantProductId) ?? null) : null
                }
                variantsLoading={
                  line.tenantProductId ? loadingVariants.has(line.tenantProductId) : false
                }
                markup={refData.defaultMarkup}
                canSeeProfit={refData.canSeeProfit}
                onChange={(l) => updateLine(i, l)}
                onRemove={() => removeLine(i)}
                onDuplicate={() => duplicateLine(i)}
                onMoveUp={() => moveLine(i, -1)}
                onMoveDown={() => moveLine(i, 1)}
              />
            ))
          )}
        </div>

        {/* Right: totals + actions */}
        <div className="lg:w-80 lg:shrink-0">
          <TotalsSidebar
            lines={lines}
            adjustments={adjustments}
            onChange={updateAdjustments}
            canSeeProfit={refData.canSeeProfit}
            saving={saving}
            onSaveDraft={() => persist(false)}
            onSaveAndSend={() => persist(true)}
          />
        </div>
      </div>

      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        products={refData.products}
        categories={refData.categories}
        onPick={addProduct}
      />

      <QuotePdfPreviewSheet
        open={previewOpen}
        onOpenChange={handlePreviewOpenChange}
        blobUrl={pdfBlobUrl}
        quoteNumber={pdfSnapshot.number}
        savedUrl={quoteId ? `/api/quotes/${quoteId}/pdf` : undefined}
      />

      {/* Mounted only while the Preview Sheet is open. Uses the frozen
          snapshot captured at open time so the renderer's own blob-URL
          callback doesn't trigger a re-render loop. */}
      {previewOpen && frozenPdfSnapshot ? (
        <QuotePdfBlobRenderer quote={frozenPdfSnapshot} onChange={setPdfBlobUrl} />
      ) : null}
    </>
  );
}
