import { redirect } from "next/navigation";

import { PaymentTermsCard } from "@/components/settings/payment-terms-card";
import { PricingRulesEditor } from "@/components/settings/pricing-rules-editor";
import { getActiveContext } from "@/lib/auth/session";
import { isManager, requireSettingsAccess } from "@/lib/auth/settings-access";
import type { PaymentInstallment } from "@/lib/payments/payment-terms";
import { createClient } from "@/lib/supabase/server";

type PlacementRow = {
  id: string;
  name: string;
  default_price: string | number | null;
  ink_cost_per_color: string | number | null;
};
type PaymentTermRow = {
  id: string;
  name: string;
  is_default: boolean;
  installments: PaymentInstallment[] | null;
};
type TierRow = { id: string; color_count: number; price: string | number };
type FeeRow = {
  id: string;
  name: string;
  default_amount: string | number | null;
  is_per_color: boolean;
};

export default async function PricingRulesSettingsPage() {
  const ctx = await getActiveContext();
  if (!ctx) redirect("/onboarding");
  await requireSettingsAccess(isManager(ctx.role));

  const supabase = await createClient();
  const orgId = ctx.orgId;

  const [{ data: placements }, { data: tiers }, { data: fees }, { data: org }, { data: terms }] =
    await Promise.all([
      supabase
        .from("placement_options")
        .select("id, name, default_price, ink_cost_per_color, sort_order")
        .eq("tenant_id", orgId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("color_count_pricing")
        .select("id, color_count, price")
        .eq("tenant_id", orgId)
        .order("color_count", { ascending: true }),
      supabase
        .from("fees")
        .select("id, name, default_amount, is_per_color, sort_order")
        .eq("tenant_id", orgId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("organizations")
        .select("default_unit_markup")
        .eq("id", orgId)
        .maybeSingle<{ default_unit_markup: string | number | null }>(),
      supabase
        .from("payment_term_options")
        .select("id, name, is_default, installments, sort_order")
        .eq("tenant_id", orgId)
        .order("sort_order", { ascending: true }),
    ]);

  const placementRows = (placements ?? []) as PlacementRow[];
  const tierRows = (tiers ?? []) as TierRow[];
  const feeRows = (fees ?? []) as FeeRow[];
  const termRows = (terms ?? []) as PaymentTermRow[];
  const markup = org?.default_unit_markup;
  const initialMarkup = markup === null || markup === undefined ? "0" : String(markup);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Pricing rules</h2>
        <p className="text-sm text-muted-foreground">
          Placements, color tiers, and fees applied when building quotes.
        </p>
      </div>

      <PaymentTermsCard
        initialTerms={termRows.map((t) => ({
          id: t.id,
          name: t.name,
          isDefault: t.is_default,
          installments: t.installments ?? [],
        }))}
      />

      <PricingRulesEditor
        initialPlacements={placementRows.map((p) => ({
          name: p.name,
          defaultPrice: p.default_price === null ? "0" : String(p.default_price),
          // Number() drops the DB's trailing zeros: "0.0500" shows as "0.05".
          inkCostPerColor: String(Number(p.ink_cost_per_color ?? 0)),
        }))}
        initialTiers={tierRows.map((t) => ({
          colorCount: String(t.color_count),
          price: String(t.price),
        }))}
        initialFees={feeRows.map((f) => ({
          name: f.name,
          defaultAmount: f.default_amount === null ? "0" : String(f.default_amount),
          isPerColor: f.is_per_color,
        }))}
        initialMarkup={initialMarkup}
      />
    </div>
  );
}
