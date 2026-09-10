"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CustomerLogoCard } from "@/components/customers/customer-logo-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ring } from "@/components/ui/ring";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type CustomerInput, createCustomer, updateCustomer } from "@/lib/actions/customers";
import { createClient } from "@/lib/supabase/browser";

const NO_TERM = "__no_term__";

type Props = {
  customerId?: string; // present = edit mode
  tenantId: string;
  initial?: Partial<CustomerInput>;
  initialLogoUrl?: string | null;
  /** Names of the org's saved payment terms, for the default-terms dropdown. */
  paymentTerms?: string[];
};

/**
 * Progressive phone mask. Strips everything but digits (so letters never stick),
 * formats US numbers as (XXX) XXX-XXXX, and — only if the user includes a
 * country code (a leading "+" or an 11-digit number starting with 1) — keeps it
 * as a "+CC " prefix. Country code is entirely optional.
 */
function formatPhoneInput(input: string): string {
  const hasPlus = input.trimStart().startsWith("+");
  const digits = input.replace(/\D/g, "");
  if (!digits) return hasPlus ? "+" : "";

  const local = (d: string): string => {
    const x = d.slice(0, 10);
    if (x.length === 0) return "";
    if (x.length < 4) return `(${x}`;
    if (x.length < 7) return `(${x.slice(0, 3)}) ${x.slice(3)}`;
    return `(${x.slice(0, 3)}) ${x.slice(3, 6)}-${x.slice(6)}`;
  };

  if (hasPlus) {
    if (digits.startsWith("1")) return `+1 ${local(digits.slice(1))}`.trimEnd();
    if (digits.length > 10) {
      return `+${digits.slice(0, digits.length - 10)} ${local(digits.slice(-10))}`;
    }
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${local(digits.slice(1))}`;
  return local(digits.slice(0, 10));
}

const emptyState: CustomerInput = {
  name: "",
  company: "",
  email: "",
  billingEmail: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  shipToDifferent: false,
  shippingAddressLine1: "",
  shippingAddressLine2: "",
  shippingCity: "",
  shippingState: "",
  shippingPostalCode: "",
  isTaxExempt: false,
  taxExemptId: "",
  defaultPaymentTerms: "",
  notes: "",
};

export function CustomerForm({
  customerId,
  tenantId,
  initial,
  initialLogoUrl,
  paymentTerms = [],
}: Props) {
  const router = useRouter();
  const isEdit = !!customerId;
  const [form, setForm] = useState<CustomerInput>({ ...emptyState, ...initial });
  // Keep a legacy/free-text value selectable so editing doesn't silently drop it.
  const termOptions =
    form.defaultPaymentTerms && !paymentTerms.includes(form.defaultPaymentTerms)
      ? [form.defaultPaymentTerms, ...paymentTerms]
      : paymentTerms;
  const [stagedLogo, setStagedLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<CustomerInput>) => setForm((prev) => ({ ...prev, ...patch }));

  async function uploadStagedLogo(newCustomerId: string): Promise<boolean> {
    if (!stagedLogo) return true;
    const supabase = createClient();
    const ext = stagedLogo.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${tenantId}/${newCustomerId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("customer-logos")
      .upload(path, stagedLogo, { upsert: true, contentType: stagedLogo.type });
    if (uploadError) {
      toast.error("Customer saved but logo upload failed", {
        description: uploadError.message,
      });
      return false;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("customer-logos").getPublicUrl(path);
    const finalUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("customers")
      .update({ logo_url: finalUrl })
      .eq("id", newCustomerId);
    if (updateError) {
      toast.error("Customer saved but logo URL didn't update", {
        description: updateError.message,
      });
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Customer name is required");
      return;
    }

    setSaving(true);
    if (customerId) {
      const result = await updateCustomer(customerId, form);
      setSaving(false);
      if (!result.ok) {
        toast.error("Couldn't save", { description: result.error });
        return;
      }
      toast.success("Saved");
    } else {
      const result = await createCustomer(form);
      if (!result.ok) {
        setSaving(false);
        toast.error("Couldn't create customer", { description: result.error });
        return;
      }
      await uploadStagedLogo(result.id);
      setSaving(false);
      toast.success("Customer created");
      router.push(`/customers/${result.id}`);
    }
  }

  return (
    <div className="space-y-6">
      {customerId ? (
        <CustomerLogoCard
          customerId={customerId}
          tenantId={tenantId}
          initialUrl={initialLogoUrl ?? null}
        />
      ) : (
        <CustomerLogoCard file={stagedLogo} onFileChange={setStagedLogo} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>The person you'll be working with.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cust-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-company">Company</Label>
              <Input
                id="cust-company"
                value={form.company}
                onChange={(e) => update({ company: e.target.value })}
                placeholder="Riverside Athletics"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cust-email">Contact email</Label>
              <Input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
                placeholder="jane@riverside.co"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-phone">Phone</Label>
              <Input
                id="cust-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => update({ phone: formatPhoneInput(e.target.value) })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-billing-email">
              Invoicing email <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cust-billing-email"
              type="email"
              value={form.billingEmail}
              onChange={(e) => update({ billingEmail: e.target.value })}
              placeholder="ap@riverside.co"
            />
            <p className="text-xs text-muted-foreground">
              Shown in the billed-to block on quotes and invoices. Leave blank to use the contact
              email.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing address</CardTitle>
          <CardDescription>
            Where invoices go. Goods ship here too unless you set a separate shipping address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-addr1">Address line 1</Label>
            <Input
              id="cust-addr1"
              autoComplete="address-line1"
              value={form.addressLine1}
              onChange={(e) => update({ addressLine1: e.target.value })}
              placeholder="123 Main St"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-addr2">
              Address line 2 <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cust-addr2"
              autoComplete="address-line2"
              value={form.addressLine2}
              onChange={(e) => update({ addressLine2: e.target.value })}
              placeholder="Suite 200"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="cust-city">City</Label>
              <Input
                id="cust-city"
                autoComplete="address-level2"
                value={form.city}
                onChange={(e) => update({ city: e.target.value })}
                placeholder="Springfield"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-state">State</Label>
              <Input
                id="cust-state"
                autoComplete="address-level1"
                maxLength={2}
                value={form.state}
                onChange={(e) => update({ state: e.target.value.toUpperCase() })}
                placeholder="IL"
                className="w-16"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-zip">ZIP</Label>
              <Input
                id="cust-zip"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={10}
                value={form.postalCode}
                onChange={(e) => update({ postalCode: e.target.value })}
                placeholder="62701"
                className="w-24"
              />
            </div>
          </div>

          {/* Phrased to match the quote builder. The column stores the
              inverse (ship_to_different), so the checkbox negates it. */}
          <label className="flex items-center gap-2 pt-1 text-sm">
            <input
              type="checkbox"
              checked={!form.shipToDifferent}
              onChange={(e) => update({ shipToDifferent: !e.target.checked })}
              className="size-4 cursor-pointer"
            />
            <span>Shipping same as billing</span>
          </label>

          {form.shipToDifferent ? (
            <div className="space-y-4 rounded-md border border-border p-3">
              <div className="text-xs font-medium text-muted-foreground">Shipping address</div>
              <div className="space-y-2">
                <Label htmlFor="cust-ship-addr1">Address line 1</Label>
                <Input
                  id="cust-ship-addr1"
                  value={form.shippingAddressLine1}
                  onChange={(e) => update({ shippingAddressLine1: e.target.value })}
                  placeholder="500 Warehouse Rd"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-ship-addr2">
                  Address line 2{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="cust-ship-addr2"
                  value={form.shippingAddressLine2}
                  onChange={(e) => update({ shippingAddressLine2: e.target.value })}
                  placeholder="Dock 4"
                />
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cust-ship-city">City</Label>
                  <Input
                    id="cust-ship-city"
                    value={form.shippingCity}
                    onChange={(e) => update({ shippingCity: e.target.value })}
                    placeholder="Springfield"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cust-ship-state">State</Label>
                  <Input
                    id="cust-ship-state"
                    maxLength={2}
                    value={form.shippingState}
                    onChange={(e) => update({ shippingState: e.target.value.toUpperCase() })}
                    placeholder="IL"
                    className="w-16"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cust-ship-zip">ZIP</Label>
                  <Input
                    id="cust-ship-zip"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.shippingPostalCode}
                    onChange={(e) => update({ shippingPostalCode: e.target.value })}
                    placeholder="62701"
                    className="w-24"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>
            Default payment terms and tax-exempt status for this customer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-terms">Default payment terms</Label>
            <Select
              value={form.defaultPaymentTerms ? form.defaultPaymentTerms : NO_TERM}
              onValueChange={(v) => update({ defaultPaymentTerms: v === NO_TERM ? "" : v })}
            >
              <SelectTrigger id="cust-terms">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TERM}>None</SelectItem>
                {termOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="cust-tax-exempt"
              type="checkbox"
              checked={form.isTaxExempt}
              onChange={(e) => update({ isTaxExempt: e.target.checked })}
              className="size-4 cursor-pointer"
            />
            <Label htmlFor="cust-tax-exempt" className="cursor-pointer">
              Tax exempt
            </Label>
          </div>
          {form.isTaxExempt ? (
            <div className="space-y-2">
              <Label htmlFor="cust-tax-id">Resale / tax-exempt ID</Label>
              <Input
                id="cust-tax-id"
                value={form.taxExemptId}
                onChange={(e) => update({ taxExemptId: e.target.value })}
                placeholder="E-12345678"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Internal — not shown to the customer.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={4}
            placeholder="Anything you want to remember about this customer."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/customers")} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Ring size="sm" className="text-current" />
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Create customer"
          )}
        </Button>
      </div>
    </div>
  );
}
