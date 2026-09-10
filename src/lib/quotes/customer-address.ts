/**
 * The two halves of one mapping: the quote builder asks for addresses
 * BILLING-first (matching the customer record), while the quotes and invoices
 * tables store them SHIPPING-first — `customer_*` is always the shipping
 * snapshot and `bill_to_same_as_shipping` means "the billed-to block mirrors
 * it". Keeping both directions in one file is what stops them drifting apart
 * and silently swapping a customer's addresses on save.
 */

/** Address columns as stored on a quote / invoice row. */
export type StoredAddresses = {
  customer_address_line1: string | null;
  customer_address_line2: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_postal_code: string | null;
  customer_country: string | null;
  bill_to_same_as_shipping: boolean;
  bill_to_line1: string | null;
  bill_to_line2: string | null;
  bill_to_city: string | null;
  bill_to_state: string | null;
  bill_to_postal_code: string | null;
  bill_to_country: string | null;
};

/** The billing-first shape the builder edits. */
export type SliceAddresses = {
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountry: string;
  shippingSameAsBilling: boolean;
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
};

/** Camel-cased column names, as the save action's Zod input expects them. */
export type SaveAddresses = {
  customerAddressLine1: string | null;
  customerAddressLine2: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerPostalCode: string | null;
  customerCountry: string | null;
  billToSameAsShipping: boolean;
  billToLine1: string | null;
  billToLine2: string | null;
  billToCity: string | null;
  billToState: string | null;
  billToPostalCode: string | null;
  billToCountry: string | null;
};

/**
 * Stored row → builder fields. When the row says billing mirrors shipping there
 * is only one address, so it fills the billing side and the shipping fields
 * stay blank behind the toggle.
 */
export function addressesToSlice(row: StoredAddresses): SliceAddresses {
  const same = row.bill_to_same_as_shipping;
  return {
    billingLine1: (same ? row.customer_address_line1 : row.bill_to_line1) ?? "",
    billingLine2: (same ? row.customer_address_line2 : row.bill_to_line2) ?? "",
    billingCity: (same ? row.customer_city : row.bill_to_city) ?? "",
    billingState: (same ? row.customer_state : row.bill_to_state) ?? "",
    billingPostalCode: (same ? row.customer_postal_code : row.bill_to_postal_code) ?? "",
    billingCountry: (same ? row.customer_country : row.bill_to_country) ?? "US",
    shippingSameAsBilling: same,
    shipLine1: same ? "" : (row.customer_address_line1 ?? ""),
    shipLine2: same ? "" : (row.customer_address_line2 ?? ""),
    shipCity: same ? "" : (row.customer_city ?? ""),
    shipState: same ? "" : (row.customer_state ?? ""),
    shipPostalCode: same ? "" : (row.customer_postal_code ?? ""),
    shipCountry: same ? "US" : (row.customer_country ?? "US"),
  };
}

/**
 * Builder fields → stored columns. Matching addresses collapse to the shipping
 * columns with `bill_to_*` left empty, which is exactly the shape quotes had
 * before the UI was flipped — so existing documents keep rendering unchanged.
 */
export function addressesForSave(slice: SliceAddresses): SaveAddresses {
  const t = (v: string) => (v.trim() === "" ? null : v.trim());
  const same = slice.shippingSameAsBilling;
  return {
    customerAddressLine1: t(same ? slice.billingLine1 : slice.shipLine1),
    customerAddressLine2: t(same ? slice.billingLine2 : slice.shipLine2),
    customerCity: t(same ? slice.billingCity : slice.shipCity),
    customerState: t(same ? slice.billingState : slice.shipState),
    customerPostalCode: t(same ? slice.billingPostalCode : slice.shipPostalCode),
    customerCountry: t(same ? slice.billingCountry : slice.shipCountry),
    billToSameAsShipping: same,
    billToLine1: same ? null : t(slice.billingLine1),
    billToLine2: same ? null : t(slice.billingLine2),
    billToCity: same ? null : t(slice.billingCity),
    billToState: same ? null : t(slice.billingState),
    billToPostalCode: same ? null : t(slice.billingPostalCode),
    billToCountry: same ? null : t(slice.billingCountry),
  };
}
