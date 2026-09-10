-- ════════════════════════════════════════════════════════════════════
-- Carry the invoicing email from quote to invoice.
--
-- Re-declares generate_invoice (last defined in manual/15). The ONLY change:
--   - copy quotes.bill_to_email → invoices.bill_to_email
--
-- bill_to_email is an OVERRIDE, not a resolved value: NULL means "use the
-- contact email", which is how the documents render it. Storing the override
-- rather than the resolved address means fixing a typo'd contact email still
-- flows through to the billed-to block.
--
-- Apply AFTER drizzle/0024_fine_kate_bishop.sql. Re-run-safe.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generate_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      UUID := auth.uid();
  v_tenant    UUID;
  v_status    TEXT;
  v_number    TEXT;
  v_invoice_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT tenant_id, status, quote_number INTO v_tenant, v_status, v_number
    FROM quotes WHERE id = p_quote_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = v_user AND organization_id = v_tenant) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Quote must be approved before invoicing';
  END IF;
  IF EXISTS (SELECT 1 FROM invoices WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'An invoice already exists for this quote';
  END IF;

  INSERT INTO invoices (
    tenant_id, invoice_number, quote_id, customer_id, status, issue_date,
    purchase_order, approved_by_name,
    customer_name, customer_company, customer_email, customer_phone,
    customer_address_line1, customer_address_line2, customer_city, customer_state,
    customer_postal_code, customer_country,
    bill_to_same_as_shipping, bill_to_line1, bill_to_line2, bill_to_city,
    bill_to_state, bill_to_postal_code, bill_to_country, bill_to_email,
    customer_tax_exempt_id,
    subtotal, tax_rate, tax_amount, is_tax_exempt,
    shipping_amount, shipping_mode, shipping_cap,
    discount_type, discount_value, discount_amount,
    deposit_type, deposit_value, deposit_amount,
    total, cost, profit, notes, terms, payment_terms, payment_method_default,
    payment_schedule
  )
  SELECT
    q.tenant_id, v_number, q.id, q.customer_id, 'pending', now()::date,
    q.purchase_order, q.approved_by_name,
    q.customer_name, q.customer_company, q.customer_email, q.customer_phone,
    q.customer_address_line1, q.customer_address_line2, q.customer_city, q.customer_state,
    q.customer_postal_code, q.customer_country,
    q.bill_to_same_as_shipping, q.bill_to_line1, q.bill_to_line2, q.bill_to_city,
    q.bill_to_state, q.bill_to_postal_code, q.bill_to_country, q.bill_to_email,
    q.customer_tax_exempt_id,
    q.subtotal, q.tax_rate, q.tax_amount, q.is_tax_exempt,
    q.shipping_amount, q.shipping_mode,
    CASE WHEN q.shipping_mode = 'estimate' THEN q.shipping_amount ELSE NULL END,
    q.discount_type, q.discount_value, q.discount_amount,
    q.deposit_type, q.deposit_value, q.deposit_amount,
    q.total, q.cost, q.profit, q.notes, q.terms, q.payment_terms, q.payment_method_default,
    q.payment_schedule
  FROM quotes q WHERE q.id = p_quote_id
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_line_items (
    tenant_id, invoice_id, source_quote_line_item_id, item_type, name, description,
    quantity, unit_price, unit_cost, total_price, total_cost, sort_order,
    sizes_breakdown, placements_data, color_name, notes
  )
  SELECT
    li.tenant_id, v_invoice_id, li.id, li.item_type, li.name, li.description,
    li.quantity, li.unit_price, li.unit_cost, li.total_price, li.total_cost, li.sort_order,
    li.sizes_breakdown, li.placements_data, li.color_name, li.notes
  FROM quote_line_items li WHERE li.quote_id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_invoice(UUID) TO authenticated;
