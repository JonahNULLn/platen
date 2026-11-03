import { cookies } from "next/headers";
import { cache } from "react";

import { env } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";

/** Name of the cookie that pins the user's active org (tenant). */
export const ACTIVE_ORG_COOKIE = "active_org_id";

/**
 * Options for the active-org cookie. HTTP-only so it can't be read/altered from
 * client JS; the value is always re-validated against the user's memberships on
 * read (see `getActiveContext`), so a tampered id is simply ignored.
 */
export function activeOrgCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: env.APP_ENV !== "development",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  };
}

export type ActiveContext = { userId: string; orgId: string; role: string };

export type AuthUser = { id: string; email: string | null };

/**
 * The signed-in user, verified LOCALLY — no network call to Supabase.
 *
 * `getClaims()` checks the session JWT's signature against the project's
 * public signing key (ES256; fetched once and cached per server process) and
 * its expiry. That's the same check the database applies to every query under
 * RLS, so it grants nothing the token couldn't already do. The one difference
 * from `getUser()`: a token revoked elsewhere (signed out on another device,
 * account deleted) keeps verifying until it expires (≤ 1h) — again exactly as
 * it would at the database. Data-changing actions that are security-sensitive
 * (account deletion, team/org management) still use `getUser()`.
 *
 * Wrapped in React `cache()`, so a request's layout, page and helpers share
 * one lookup.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/**
 * The signed-in user's identity, active org, and role in that org.
 *
 * The active org is whichever membership the `active_org_id` cookie points to,
 * *if* the user still belongs to it; otherwise it falls back to their first
 * membership. This is the single place that resolves which tenant a request
 * belongs to. Returns null when there's no session or no membership — callers
 * should treat that as unauthorized / not-yet-onboarded. Cached per request.
 */
export const getActiveContext = cache(async (): Promise<ActiveContext | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .returns<{ organization_id: string; role: string }[]>();

  const first = memberships?.[0];
  if (!first) return null;

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  // Honor the cookie only if it names an org the user is actually a member of.
  const active =
    (wanted ? memberships.find((m) => m.organization_id === wanted) : undefined) ?? first;

  return { userId: user.id, orgId: active.organization_id, role: active.role };
});

/**
 * Convenience wrapper when a caller only needs the active org id. Resolves via
 * the same cookie-aware logic as `getActiveContext`.
 */
export async function getActiveOrgId(): Promise<string | null> {
  return (await getActiveContext())?.orgId ?? null;
}
