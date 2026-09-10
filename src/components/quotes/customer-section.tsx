"use client";

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import type { CustomerSummary } from "@/components/customers/customer-card";
import { CustomerPickerDialog } from "@/components/quotes/customer-picker-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RefCustomer } from "@/lib/quotes/types";
import { cn } from "@/lib/utils";

export type CustomerSlice = {
  customerId: string | null;
  name: string;
  company: string;
  email: string;
  phone: string;

  /**
   * Billing is the primary address here, matching the customer record. The
   * quotes/invoices tables store it the other way round — `customer_*` is the
   * SHIPPING snapshot and `bill_to_*` is billing — so the builder maps between
   * the two shapes on save and load. Keeping the UI billing-first means the
   * quote page and the customer page ask the same question the same way.
   */
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountry: string;

  /** When true the goods go to the billing address and `ship*` is unused. */
  shippingSameAsBilling: boolean;
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;

  /** Invoicing email override; blank = use the contact email above. */
  billToEmail: string;

  isTaxExempt: boolean;
  customerTaxExemptId: string;
};

export function CustomerSection({
  value,
  onChange,
  customers,
  onSelectCustomer,
}: {
  value: CustomerSlice;
  onChange: (patch: Partial<CustomerSlice>) => void;
  customers: RefCustomer[];
  /** Fired when a saved customer is picked — lets the quote apply their
   *  defaults (e.g. payment terms) that live outside the customer slice. */
  onSelectCustomer?: (customer: RefCustomer) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const summaries: CustomerSummary[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    city: c.city,
    state: c.state,
    isTaxExempt: c.isTaxExempt,
    logoUrl: c.logoUrl,
  }));

  const selected = customers.find((c) => c.id === value.customerId) ?? null;
  const selectedLabel = selected
    ? selected.company
      ? `${selected.company} — ${selected.name}`
      : selected.name
    : "Select a customer";

  function handleSelectCustomer(customerId: string) {
    const c = customers.find((x) => x.id === customerId);
    if (!c) {
      onChange({ customerId });
      return;
    }
    // Snapshot the customer's fields onto the quote; tax-exempt defaults to
    // the customer's status (still overridable per quote). The customer record
    // is billing-first in exactly the same way, so this is a straight copy.
    onChange({
      customerId: c.id,
      name: c.name,
      company: c.company ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      billingLine1: c.addressLine1 ?? "",
      billingLine2: c.addressLine2 ?? "",
      billingCity: c.city ?? "",
      billingState: c.state ?? "",
      billingPostalCode: c.postalCode ?? "",
      billingCountry: c.country ?? "US",
      shippingSameAsBilling: !c.shipToDifferent,
      shipLine1: c.shipToDifferent ? (c.shippingAddressLine1 ?? "") : "",
      shipLine2: c.shipToDifferent ? (c.shippingAddressLine2 ?? "") : "",
      shipCity: c.shipToDifferent ? (c.shippingCity ?? "") : "",
      shipState: c.shipToDifferent ? (c.shippingState ?? "") : "",
      shipPostalCode: c.shipToDifferent ? (c.shippingPostalCode ?? "") : "",
      shipCountry: c.shipToDifferent ? (c.shippingCountry ?? "US") : "US",
      billToEmail: c.billingEmail ?? "",
      isTaxExempt: c.isTaxExempt,
      customerTaxExemptId: c.taxExemptId ?? "",
    });
    onSelectCustomer?.(c);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Button
          type="button"
          variant="outline"
          onClick={() => setPickerOpen(true)}
          className={cn(
            "w-full justify-between gap-2 font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
        <CustomerPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          customers={summaries}
          onSelect={handleSelectCustomer}
        />

        {/* Contact (snapshot fields) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="qcust-name">Name</Label>
            <Input
              id="qcust-name"
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qcust-company">Company</Label>
            <Input
              id="qcust-company"
              value={value.company}
              onChange={(e) => onChange({ company: e.target.value })}
              placeholder="Acme Co."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qcust-email">Email</Label>
            <Input
              id="qcust-email"
              type="email"
              value={value.email}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="jane@acme.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qcust-phone">Phone</Label>
            <Input
              id="qcust-phone"
              type="tel"
              value={value.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              placeholder="(555) 555-5555"
            />
          </div>
        </div>

        {/* Billing address — primary, same as on the customer record */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Billing address</div>
          <Input
            value={value.billingLine1}
            onChange={(e) => onChange({ billingLine1: e.target.value })}
            placeholder="Address line 1"
          />
          <Input
            value={value.billingLine2}
            onChange={(e) => onChange({ billingLine2: e.target.value })}
            placeholder="Address line 2 (optional)"
          />
          <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
            <Input
              value={value.billingCity}
              onChange={(e) => onChange({ billingCity: e.target.value })}
              placeholder="City"
            />
            <Input
              value={value.billingState}
              maxLength={2}
              onChange={(e) => onChange({ billingState: e.target.value.toUpperCase() })}
              placeholder="ST"
            />
            <Input
              value={value.billingPostalCode}
              onChange={(e) => onChange({ billingPostalCode: e.target.value })}
              placeholder="ZIP"
            />
          </div>
        </div>

        {/* Invoicing email + shipping */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="q-bill-email">
              Invoicing email <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="q-bill-email"
              type="email"
              value={value.billToEmail}
              onChange={(e) => onChange({ billToEmail: e.target.value })}
              placeholder={value.email || "Defaults to the contact email"}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.shippingSameAsBilling}
              onChange={(e) => onChange({ shippingSameAsBilling: e.target.checked })}
              className="size-4 cursor-pointer"
            />
            <span>Shipping same as billing</span>
          </label>
          {!value.shippingSameAsBilling ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="text-xs font-medium text-muted-foreground">Shipping address</div>
              <Input
                value={value.shipLine1}
                onChange={(e) => onChange({ shipLine1: e.target.value })}
                placeholder="Address line 1"
              />
              <Input
                value={value.shipLine2}
                onChange={(e) => onChange({ shipLine2: e.target.value })}
                placeholder="Address line 2 (optional)"
              />
              <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                <Input
                  value={value.shipCity}
                  onChange={(e) => onChange({ shipCity: e.target.value })}
                  placeholder="City"
                />
                <Input
                  value={value.shipState}
                  maxLength={2}
                  onChange={(e) => onChange({ shipState: e.target.value.toUpperCase() })}
                  placeholder="ST"
                />
                <Input
                  value={value.shipPostalCode}
                  onChange={(e) => onChange({ shipPostalCode: e.target.value })}
                  placeholder="ZIP"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Tax-exempt */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.isTaxExempt}
              onChange={(e) => onChange({ isTaxExempt: e.target.checked })}
              className="size-4 cursor-pointer"
            />
            <span>Tax exempt</span>
          </label>
          {value.isTaxExempt ? (
            <div className="space-y-2">
              <Label htmlFor="qcust-exempt">Resale / tax-exempt ID</Label>
              <Input
                id="qcust-exempt"
                value={value.customerTaxExemptId}
                onChange={(e) => onChange({ customerTaxExemptId: e.target.value })}
                placeholder="E-12345678"
              />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
