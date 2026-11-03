import { UserPlus } from "lucide-react";
import { redirect } from "next/navigation";

import { JoinKeyCard } from "@/components/settings/join-key-card";
import { type TeamMember, TeamMembers } from "@/components/settings/team-members";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getActiveContext, getActiveOrgId, getAuthUser } from "@/lib/auth/session";
import { isManager, requireSettingsAccess } from "@/lib/auth/settings-access";
import { createClient } from "@/lib/supabase/server";

type MembershipRow = {
  user_id: string;
  role: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
};

// Email invite is intentionally hidden for v0.1 (no email sending yet). The
// card markup is kept so it can be switched back on when email is wired.
const SHOW_EMAIL_INVITE = false;

export default async function TeamSettingsPage() {
  const ctx = await getActiveContext();
  if (!ctx) redirect("/onboarding");
  await requireSettingsAccess(isManager(ctx.role));

  const supabase = await createClient();
  const user = await getAuthUser();
  const orgId = await getActiveOrgId();

  const [{ data: org }, { data: memberships }] = await Promise.all([
    orgId
      ? supabase
          .from("organizations")
          .select("join_key")
          .eq("id", orgId)
          .maybeSingle<{ join_key: string | null }>()
      : Promise.resolve({ data: null }),
    orgId
      ? supabase
          .from("memberships")
          // memberships has two FKs to profiles (user_id + invited_by), so the
          // embed must be pinned to the user_id relationship or PostgREST errors.
          .select(
            "user_id, role, profiles!memberships_user_id_profiles_id_fk(first_name, last_name, avatar_url, email)",
          )
          .eq("organization_id", orgId)
      : Promise.resolve({ data: null }),
  ]);

  const rows = (memberships as unknown as MembershipRow[] | null) ?? [];
  const members: TeamMember[] = rows.map((m) => {
    const name = `${m.profiles?.first_name ?? ""} ${m.profiles?.last_name ?? ""}`.trim();
    return {
      userId: m.user_id,
      name: name || m.profiles?.email || "Member",
      email: m.profiles?.email ?? null,
      avatarUrl: m.profiles?.avatar_url ?? null,
      role: m.role,
    };
  });

  const currentUserId = user?.id ?? "";
  const callerRole = rows.find((m) => m.user_id === currentUserId)?.role ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Team</h2>
        <p className="text-sm text-muted-foreground">
          Invite people to your shop and manage their roles.
        </p>
      </div>

      {SHOW_EMAIL_INVITE ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="size-4 text-muted-foreground" />
              <CardTitle>Invite a teammate</CardTitle>
            </div>
            <CardDescription>
              They'll get an invite link by email and can join with their own login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input type="email" placeholder="teammate@example.com" className="flex-1" />
              <Button size="sm">Send invite</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {org?.join_key ? <JoinKeyCard joinKey={org.join_key} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} active</CardDescription>
        </CardHeader>
        <CardContent>
          <TeamMembers members={members} currentUserId={currentUserId} callerRole={callerRole} />
        </CardContent>
      </Card>
    </div>
  );
}
