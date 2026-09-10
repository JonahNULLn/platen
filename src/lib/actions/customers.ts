"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type CustomerInput = {
  name: string;
  company: string;
  /** Day-to-day contact email. */
  email: string;
  /** Optional invoicing email; blank means "use the contact email". */
  billingEmail: string;
  phone: string;
  // Billing address.
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  /** When false the shipping fields below are ignored — goods go to billing. */
  shipToDifferent: boolean;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  isTaxExempt: boolean;
  taxExemptId: string;
  defaultPaymentTerms: string;
  notes: string;
};

export type CreateCustomerResult = { ok: true; id: string } | { ok: false; error: string };

export type UpdateCustomerResult = { ok: true } | { ok: false; error: string };

const clean = (v: string) => {
  const t = v.trim();
  return t.length === 0 ? null : t;
};

export async function createCustomer(input: CustomerInput): Promise<CreateCustomerResult> {
  if (!input.name.trim()) {
    return { ok: false, error: "Customer name is required" };
  }

  const orgId = await getActiveOrgId();
  if (!orgId) {
    return { ok: false, error: "No active organization" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: orgId,
      name: input.name.trim(),
      company: clean(input.company),
      email: clean(input.email),
      phone: clean(input.phone),
      billing_email: clean(input.billingEmail),
      ship_to_different: input.shipToDifferent,
      shipping_address_line1: input.shipToDifferent ? clean(input.shippingAddressLine1) : null,
      shipping_address_line2: input.shipToDifferent ? clean(input.shippingAddressLine2) : null,
      shipping_city: input.shipToDifferent ? clean(input.shippingCity) : null,
      shipping_state: input.shipToDifferent ? clean(input.shippingState) : null,
      shipping_postal_code: input.shipToDifferent ? clean(input.shippingPostalCode) : null,
      address_line1: clean(input.addressLine1),
      address_line2: clean(input.addressLine2),
      city: clean(input.city),
      state: clean(input.state),
      postal_code: clean(input.postalCode),
      is_tax_exempt: input.isTaxExempt,
      tax_exempt_id: input.isTaxExempt ? clean(input.taxExemptId) : null,
      default_payment_terms: clean(input.defaultPaymentTerms),
      notes: clean(input.notes),
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/customers");
  return { ok: true, id: data.id };
}

export async function updateCustomer(
  customerId: string,
  input: CustomerInput,
): Promise<UpdateCustomerResult> {
  if (!input.name.trim()) {
    return { ok: false, error: "Customer name is required" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      name: input.name.trim(),
      company: clean(input.company),
      email: clean(input.email),
      phone: clean(input.phone),
      billing_email: clean(input.billingEmail),
      ship_to_different: input.shipToDifferent,
      shipping_address_line1: input.shipToDifferent ? clean(input.shippingAddressLine1) : null,
      shipping_address_line2: input.shipToDifferent ? clean(input.shippingAddressLine2) : null,
      shipping_city: input.shipToDifferent ? clean(input.shippingCity) : null,
      shipping_state: input.shipToDifferent ? clean(input.shippingState) : null,
      shipping_postal_code: input.shipToDifferent ? clean(input.shippingPostalCode) : null,
      address_line1: clean(input.addressLine1),
      address_line2: clean(input.addressLine2),
      city: clean(input.city),
      state: clean(input.state),
      postal_code: clean(input.postalCode),
      is_tax_exempt: input.isTaxExempt,
      tax_exempt_id: input.isTaxExempt ? clean(input.taxExemptId) : null,
      default_payment_terms: clean(input.defaultPaymentTerms),
      notes: clean(input.notes),
    })
    .eq("id", customerId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function deleteCustomer(customerId: string): Promise<UpdateCustomerResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/customers");
  return { ok: true };
}
