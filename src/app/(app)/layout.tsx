import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getActiveContext, getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type MembershipWithOrg = {
  organizations: {
    id: string;
    name: string;
    logo_url: string | null;
    subscription_plan: string | null;
  } | null;
};

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  // Verified locally (no Auth round trip) and shared with the page via cache().
  const user = await getAuthUser();

  // Everything below is independent, so fetch it in parallel:
  //   - canonical profile data (profiles is the source of truth;
  //     auth.user_metadata is just the initial seed at signup)
  //   - the orgs the user belongs to, for the switcher
  //   - the cookie-aware active org, so the switcher highlights the right one
  const [{ data: profile }, { data: memberships }, activeContext] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("organizations(id, name, logo_url, subscription_plan)")
      .eq("user_id", user?.id ?? ""),
    getActiveContext(),
  ]);

  const orgs = ((memberships as MembershipWithOrg[] | null) ?? [])
    .map((m) => m.organizations)
    .filter((o): o is NonNullable<MembershipWithOrg["organizations"]> => o !== null)
    .map((o) => ({
      id: o.id,
      name: o.name,
      logoUrl: o.logo_url,
      subscriptionPlan: o.subscription_plan ?? "trial",
    }));

  const activeOrgId = activeContext?.orgId ?? null;
  const isOwner = activeContext?.role === "owner";

  const firstName = profile?.first_name ?? "";
  const lastName = profile?.last_name ?? "";
  const fullName = `${firstName} ${lastName}`.trim() || user?.email || "Member";
  const initials =
    ((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() ||
    (user?.email?.[0] ?? "?").toUpperCase();

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name: fullName,
          email: user?.email ?? "",
          initials,
          avatarUrl: profile?.avatar_url ?? null,
        }}
        orgs={orgs}
        activeOrgId={activeOrgId}
      />
      <SidebarInset>
        <AppTopbar isOwner={isOwner} />
        <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
