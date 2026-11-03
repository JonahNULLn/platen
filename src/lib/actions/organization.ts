"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ONBOARDED_COOKIE } from "@/lib/auth/onboarding-cookie";
import {
  ACTIVE_ORG_COOKIE,
  activeOrgCookieOptions,
  getActiveContext,
  getActiveOrgId,
} from "@/lib/auth/session";
import { isManager } from "@/lib/auth/settings-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { removeFolder } from "@/lib/supabase/storage";

export type UpdateOrgInput = {
  orgId: string;
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  /** Stored as a decimal (e.g. 0.0925 for 9.25 %). */
  defaultTaxRate: number;
  defaultMinQuantity: number;
  quotePrefix: string;
  invoicePrefix: string;
  /** "sequential" (incrementing counter) or "random" (random padded number). */
  numberMode: "sequential" | "random";
  /** Sequential only: the number the next quote/invoice should start from.
   *  null = leave the counters untouched. */
  startNumber: number | null;
};

export type UpdateOrgResult = { ok: true } | { ok: false; error: string };

const clean = (v: string) => {
  const t = v.trim();
  return t.length === 0 ? null : t;
};

export async function updateOrganization(input: UpdateOrgInput): Promise<UpdateOrgResult> {
  const ctx = await getActiveContext();
  if (!ctx) return { ok: false, error: "No active organization" };
  if (!isManager(ctx.role)) {
    return { ok: false, error: "You don't have permission to edit organization settings." };
  }

  // Defaults — editable by owner + admin.
  const mode = input.numberMode === "random" ? "random" : "sequential";
  const update: Record<string, unknown> = {
    default_tax_rate: input.defaultTaxRate,
    default_min_quantity: input.defaultMinQuantity,
    quote_number_prefix: clean(input.quotePrefix) ?? "Q-",
    invoice_number_prefix: clean(input.invoicePrefix) ?? "INV-",
    document_number_mode: mode,
  };

  // Sequential + an explicit start number → reset both counters to it. (Random
  // ignores the counters.) Skipped when startNumber is null / unchanged.
  if (mode === "sequential" && input.startNumber != null) {
    if (!Number.isInteger(input.startNumber) || input.startNumber < 1) {
      return { ok: false, error: "Starting number must be a whole number of 1 or more." };
    }
    update.next_quote_number = input.startNumber;
    update.next_invoice_number = input.startNumber;
  }

  // Shop (business) info — owner only.
  if (ctx.role === "owner") {
    if (!input.name.trim()) return { ok: false, error: "Shop name is required" };
    update.name = input.name.trim();
    update.email = clean(input.email);
    update.phone = clean(input.phone);
    update.address_line1 = clean(input.addressLine1);
    update.address_line2 = clean(input.addressLine2);
    update.city = clean(input.city);
    update.state = clean(input.state);
    update.postal_code = clean(input.postalCode);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(update).eq("id", ctx.orgId);
  if (error) {
    return { ok: false, error: error.message };
  }

  // Bust caches so the sidebar (org name) and any other reader picks up changes.
  revalidatePath("/", "layout");
  return { ok: true };
}

export type SetActiveOrgResult = { ok: true } | { ok: false; error: string };

/**
 * Switch the caller's active org by pinning the `active_org_id` cookie. The
 * target must be an org the user actually belongs to — otherwise the cookie
 * would just be ignored on read anyway, so we reject up front.
 */
export async function setActiveOrg(orgId: string): Promise<SetActiveOrgResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "You're not a member of that organization." };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, activeOrgCookieOptions());

  revalidatePath("/", "layout");
  return { ok: true };
}

// Success path ends in a redirect (never returns); only failures return.
type DeleteOrgResult = { ok: false; error: string };

/**
 * Permanently delete the caller's active organization and everything in it.
 * Same destructive flow as account deletion, minus the auth-user part — the
 * caller keeps their account but is dropped back to onboarding.
 *
 * The target org is the session's active org (never a param), and the caller
 * must be its owner — so a user can only ever delete a shop they own.
 *
 * After the cascade, any former member left with no remaining membership has
 * `onboarding_complete` reset to false, forcing them to create or join a shop.
 */
export async function deleteOrganization(): Promise<DeleteOrgResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { ok: false, error: "No active organization to delete." };

  const admin = createAdminClient();

  // Only the owner may delete the org.
  const { data: caller, error: callerError } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (callerError) return { ok: false, error: callerError.message };
  if (caller?.role !== "owner") {
    return { ok: false, error: "Only the shop owner can delete the organization." };
  }

  // Capture members before the cascade removes their memberships.
  const { data: members, error: membersError } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", orgId);
  if (membersError) return { ok: false, error: membersError.message };
  const memberIds = (members ?? [])
    .map((m) => m.user_id as string | null)
    .filter((id): id is string => id !== null);

  // Storage cleanup (cascade never touches Storage objects).
  await removeFolder(admin, "org-logos", orgId);
  await removeFolder(admin, "customer-logos", orgId);

  // Delete the org — FK cascade wipes customers, catalog, pricing rules,
  // memberships, and (later) quotes/invoices/jobs for this tenant.
  const { error: orgError } = await admin.from("organizations").delete().eq("id", orgId);
  if (orgError) return { ok: false, error: orgError.message };

  // Force re-onboarding for any former member who now belongs to no org.
  for (const memberId of memberIds) {
    const { count } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", memberId);
    if ((count ?? 0) === 0) {
      await admin.from("profiles").update({ onboarding_complete: false }).eq("id", memberId);
    }
  }

  // Drop the active-org cookie if it pointed at the deleted org, so the next
  // read falls back cleanly to a remaining membership (or none).
  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_ORG_COOKIE)?.value === orgId) {
    cookieStore.delete(ACTIVE_ORG_COOKIE);
  }
  // Forget "finished onboarding" — the caller may now belong to no shop, so
  // the middleware must re-check instead of trusting the remembered answer.
  cookieStore.delete(ONBOARDED_COOKIE);

  revalidatePath("/", "layout");
  redirect("/onboarding");
}
