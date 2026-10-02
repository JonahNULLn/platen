"use server";

import { revalidatePath } from "next/cache";

import { getActiveContext } from "@/lib/auth/session";
import { isManager } from "@/lib/auth/settings-access";
import {
  type ColorTierInput,
  type FeeInput,
  type PaymentTermInput,
  type PlacementInput,
  colorTiersSchema,
  feesSchema,
  paymentTermsSchema,
  placementsSchema,
} from "@/lib/schemas/pricing-rules";
import { createClient } from "@/lib/supabase/server";

type MutateResult = { ok: true } | { ok: false; error: string };

/**
 * Each save replaces the tenant's full set for that rule type (delete + insert).
 * Safe because quotes snapshot placement/fee data into JSONB at build time, so
 * editing the live rules never mutates historical quotes.
 */

export async function savePlacements(rows: PlacementInput[]): Promise<MutateResult> {
  const parsed = placementsSchema.safeParse(rows);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid placements" };
  }

  const ctx = await getActiveContext();
  if (!ctx || !isManager(ctx.role)) {
    return { ok: false, error: "You don't have permission to edit settings." };
  }
  const orgId = ctx.orgId;

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("placement_options")
    .delete()
    .eq("tenant_id", orgId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (parsed.data.length > 0) {
    const insertRows = parsed.data.map((p, i) => ({
      tenant_id: orgId,
      name: p.name,
      default_price: p.defaultPrice.toFixed(2),
      ink_cost_per_color: p.inkCostPerColor.toFixed(4),
      sort_order: i + 1,
    }));
    const { error } = await supabase.from("placement_options").insert(insertRows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/settings/pricing-rules");
  return { ok: true };
}

export async function saveColorTiers(rows: ColorTierInput[]): Promise<MutateResult> {
  const parsed = colorTiersSchema.safeParse(rows);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid color tiers" };
  }

  const ctx = await getActiveContext();
  if (!ctx || !isManager(ctx.role)) {
    return { ok: false, error: "You don't have permission to edit settings." };
  }
  const orgId = ctx.orgId;

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("color_count_pricing")
    .delete()
    .eq("tenant_id", orgId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (parsed.data.length > 0) {
    const insertRows = parsed.data.map((t) => ({
      tenant_id: orgId,
      color_count: t.colorCount,
      price: t.price.toFixed(2),
    }));
    const { error } = await supabase.from("color_count_pricing").insert(insertRows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/settings/pricing-rules");
  return { ok: true };
}

export async function saveFees(rows: FeeInput[]): Promise<MutateResult> {
  const parsed = feesSchema.safeParse(rows);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid fees" };
  }

  const ctx = await getActiveContext();
  if (!ctx || !isManager(ctx.role)) {
    return { ok: false, error: "You don't have permission to edit settings." };
  }
  const orgId = ctx.orgId;

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("fees").delete().eq("tenant_id", orgId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (parsed.data.length > 0) {
    const insertRows = parsed.data.map((f, i) => ({
      tenant_id: orgId,
      name: f.name,
      default_amount: f.defaultAmount.toFixed(2),
      is_per_color: f.isPerColor,
      sort_order: i + 1,
    }));
    const { error } = await supabase.from("fees").insert(insertRows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/settings/pricing-rules");
  return { ok: true };
}

export async function savePaymentTerms(rows: PaymentTermInput[]): Promise<MutateResult> {
  const parsed = paymentTermsSchema.safeParse(rows);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payment terms" };
  }

  const ctx = await getActiveContext();
  if (!ctx || !isManager(ctx.role)) {
    return { ok: false, error: "You don't have permission to edit settings." };
  }
  const orgId = ctx.orgId;

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("payment_term_options")
    .delete()
    .eq("tenant_id", orgId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (parsed.data.length > 0) {
    const insertRows = parsed.data.map((t, i) => ({
      tenant_id: orgId,
      name: t.name,
      is_default: t.isDefault,
      installments: t.installments,
      sort_order: i + 1,
    }));
    const { error } = await supabase.from("payment_term_options").insert(insertRows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/settings/pricing-rules");
  return { ok: true };
}

export async function saveDefaultMarkup(amount: number): Promise<MutateResult> {
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Markup must be 0 or more" };
  }

  const ctx = await getActiveContext();
  if (!ctx || !isManager(ctx.role)) {
    return { ok: false, error: "You don't have permission to edit settings." };
  }
  const orgId = ctx.orgId;

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ default_unit_markup: amount.toFixed(2) })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/pricing-rules");
  return { ok: true };
}
