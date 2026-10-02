import { z } from "zod";

const money = z.coerce
  .number()
  .min(0, "Must be 0 or more")
  .multipleOf(0.01, "At most 2 decimal places");

/** Ink cost runs to fractions of a cent, so it gets 4 decimals, not 2. */
const inkCost = z.coerce
  .number()
  .min(0, "Must be 0 or more")
  .multipleOf(0.0001, "At most 4 decimal places");

export const placementSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  defaultPrice: money,
  inkCostPerColor: inkCost,
});
export const placementsSchema = z.array(placementSchema);
export type PlacementInput = z.infer<typeof placementSchema>;

export const colorTierSchema = z.object({
  colorCount: z.coerce.number().int().min(1, "Color count must be at least 1"),
  price: money,
});
export const colorTiersSchema = z
  .array(colorTierSchema)
  .refine(
    (tiers) => new Set(tiers.map((t) => t.colorCount)).size === tiers.length,
    "Each color count can only appear once",
  );
export type ColorTierInput = z.infer<typeof colorTierSchema>;

export const feeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  defaultAmount: money,
  isPerColor: z.boolean(),
});
export const feesSchema = z.array(feeSchema);
export type FeeInput = z.infer<typeof feeSchema>;

const installmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().max(60),
  mode: z.enum(["percent", "fixed"]),
  value: z.coerce.number().min(0, "Must be 0 or more"),
  trigger: z.enum(["at_order", "on_completion", "on_delivery", "net_days", "on_receipt"]),
  netDays: z.coerce.number().int().min(0).max(365),
});

export const paymentTermSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  isDefault: z.boolean(),
  installments: z.array(installmentSchema).min(1, "Add at least one installment"),
});
export const paymentTermsSchema = z
  .array(paymentTermSchema)
  .refine(
    (terms) => terms.filter((t) => t.isDefault).length <= 1,
    "Only one payment term can be the default",
  );
export type PaymentTermInput = z.infer<typeof paymentTermSchema>;
