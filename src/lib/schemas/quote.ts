import { z } from "zod";

import { shippingModes } from "@/lib/quotes/shipping";

const money = z.coerce.number().min(0, "Must be 0 or more");
const nullableText = z.string().trim().nullable();

export const sizeBreakdownEntrySchema = z.object({
  size: z.string().trim().min(1),
  qty: z.coerce.number().int().min(0),
  unitPrice: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).nullable().optional(),
  overridden: z.boolean().optional(),
  costOverridden: z.boolean().optional(),
});

export const placementEntrySchema = z.object({
  placementId: z.string().uuid().nullable(),
  placementName: z.string().trim().min(1),
  colorCount: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0),
  inkCostPerColor: z.coerce.number().min(0).nullable().optional(),
});

/** Snapshot of a chosen payment term's installments, stored on the quote. */
export const paymentInstallmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().max(60),
  mode: z.enum(["percent", "fixed"]),
  value: z.coerce.number().min(0),
  trigger: z.enum(["at_order", "on_completion", "on_delivery", "net_days", "on_receipt"]),
  netDays: z.coerce.number().int().min(0).max(365),
});

export const quoteLineItemSchema = z.object({
  id: z.string().uuid().optional(),
  tenantProductId: z.string().uuid().nullable(),
  itemType: z.enum(["product", "custom", "fee"]),
  name: z.string().trim().min(1, "Item name is required"),
  description: nullableText,
  quantity: z.coerce.number().int().min(0),
  unitPrice: money,
  unitCost: money.nullable(),
  colorName: nullableText,
  notes: nullableText,
  sizesBreakdown: z.array(sizeBreakdownEntrySchema).nullable(),
  placementsData: z.array(placementEntrySchema).nullable(),
});
export type QuoteLineItemInput = z.infer<typeof quoteLineItemSchema>;

export const quoteInputSchema = z.object({
  customerId: z.string().uuid().nullable(),

  // Customer snapshot (shipping).
  customerName: nullableText,
  customerCompany: nullableText,
  customerEmail: nullableText,
  customerPhone: nullableText,
  customerAddressLine1: nullableText,
  customerAddressLine2: nullableText,
  customerCity: nullableText,
  customerState: nullableText,
  customerPostalCode: nullableText,
  customerCountry: nullableText,

  // Billing.
  billToSameAsShipping: z.boolean(),
  billToLine1: nullableText,
  billToLine2: nullableText,
  billToCity: nullableText,
  billToState: nullableText,
  billToPostalCode: nullableText,
  billToCountry: nullableText,
  /** Invoicing email override; null = fall back to the contact email. */
  billToEmail: nullableText,

  customerTaxExemptId: nullableText,

  quoteDate: z.string().min(1),
  expiresAt: z.string().nullable(),

  /** Customer's PO number — mirrored onto the linked invoice on save. */
  purchaseOrder: nullableText,

  // Adjustments / tax (taxRate is a decimal, e.g. 0.0925).
  isTaxExempt: z.boolean(),
  taxRate: z.coerce.number().min(0),
  shippingAmount: money,
  shippingMode: z.enum(shippingModes),
  discountType: z.enum(["amount", "percent"]),
  discountValue: money,
  depositType: z.enum(["amount", "percent"]),
  depositValue: money,

  notes: nullableText,
  internalNotes: nullableText,
  terms: nullableText,
  paymentTerms: nullableText,
  paymentMethodDefault: nullableText,
  /** Installments snapshotted from the chosen payment term; null when none. */
  paymentSchedule: z.array(paymentInstallmentSchema).nullable(),

  lineItems: z.array(quoteLineItemSchema),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;
