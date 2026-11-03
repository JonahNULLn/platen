import { KeyRound, Mail } from "lucide-react";

import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type OwnedMembership = { role: string; organizations: { name: string } | null };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, avatar_url")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organizations(name)")
    .eq("user_id", user?.id ?? "")
    .eq("role", "owner");

  const ownedOrgNames = ((memberships as OwnedMembership[] | null) ?? [])
    .map((m) => m.organizations?.name)
    .filter((n): n is string => Boolean(n));

  const firstName = profile?.first_name ?? "";
  const lastName = profile?.last_name ?? "";
  const email = user?.email ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Your personal profile and how you sign in.</p>
      </div>

      <ProfileCard
        userId={user?.id ?? ""}
        firstName={firstName}
        lastName={lastName}
        initialAvatarUrl={profile?.avatar_url ?? null}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <CardTitle>Email</CardTitle>
          </div>
          <CardDescription>Used to sign in and receive system notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" defaultValue={email} disabled />
            <p className="text-xs text-muted-foreground">
              Email change flow lands in a later phase.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <CardTitle>Password</CardTitle>
          </div>
          <CardDescription>
            Set a new password. You'll be signed out of other sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" placeholder="••••••••" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline">
              Update password
            </Button>
          </div>
        </CardContent>
      </Card>

      <DeleteAccountCard ownedOrgNames={ownedOrgNames} />
    </div>
  );
}
