import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function NewCustomerPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const tenantId = membership?.organization_id;
  if (!tenantId) redirect("/onboarding");

  const { data: terms } = await supabase
    .from("payment_term_options")
    .select("name")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  const paymentTerms = ((terms ?? []) as { name: string }[]).map((t) => t.name);

  return (
    <>
      <PageHeader title="New customer" subtitle="Add a new customer to your shop." />
      <CustomerForm tenantId={tenantId} paymentTerms={paymentTerms} />
    </>
  );
}
