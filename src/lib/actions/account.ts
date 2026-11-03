"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ONBOARDED_COOKIE } from "@/lib/auth/onboarding-cookie";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { removeFolder } from "@/lib/supabase/storage";

// Success path ends in a redirect (never returns); only failures return.
type DeleteAccountResult = { ok: false; error: string };

/**
 * Permanently delete the signed-in user's account. If they own any orgs, those
 * orgs and ALL their data are deleted too (DB cascade), and the orgs' storage
 * (logos, customer logos) plus the user's avatar are removed to reclaim space.
 *
 * The target user is always the authenticated session's user — never a param.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  const userId = user.id;

  const admin = createAdminClient();

  // Orgs this user owns (role = owner).
  const { data: owned, error: ownedError } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("role", "owner");
  if (ownedError) return { ok: false, error: ownedError.message };

  const orgIds = (owned ?? [])
    .map((m) => m.organization_id as string | null)
    .filter((id): id is string => id !== null);

  // Storage cleanup (cascade never touches Storage objects).
  for (const orgId of orgIds) {
    await removeFolder(admin, "org-logos", orgId);
    await removeFolder(admin, "customer-logos", orgId);
  }
  await removeFolder(admin, "avatars", userId);

  // Delete owned orgs — FK cascade wipes customers, catalog, pricing rules,
  // memberships, and (later) quotes/invoices/jobs for each tenant.
  if (orgIds.length > 0) {
    const { error: orgError } = await admin.from("organizations").delete().in("id", orgIds);
    if (orgError) return { ok: false, error: orgError.message };
  }

  // Delete the auth user — cascades profile + any remaining (non-owner)
  // memberships. Done last so the session stays valid through the work above.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) return { ok: false, error: deleteUserError.message };

  // Best-effort: clear the now-stale session cookies.
  try {
    await supabase.auth.signOut();
  } catch {
    // Token is already invalid — cookies get replaced on next request anyway.
  }
  (await cookies()).delete(ONBOARDED_COOKIE);

  redirect("/login?deleted=1");
}
