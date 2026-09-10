-- ════════════════════════════════════════════════════════════════════
-- Payment method can never be empty.
--
-- "None" was removed from the picker, but the app is not the only way a row
-- gets written (generate_invoice, quote clones/revisions, seeds, hand-run SQL).
-- This makes the guarantee at the database instead, so no document can end up
-- without a payment method no matter which path created it:
--
--   1. backfill every existing NULL / '' / 'None' to 'Check'
--   2. column DEFAULT 'Check' for inserts that omit it entirely
--   3. a BEFORE INSERT OR UPDATE trigger that coerces NULL / '' / 'None'
--      (case-insensitive) to 'Check'
--
-- The trigger is what actually closes the hole: a DEFAULT does nothing when a
-- caller explicitly passes NULL, which is exactly what the old "None" option did.
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- 1. Backfill.
UPDATE quotes
   SET payment_method_default = 'Check'
 WHERE payment_method_default IS NULL
    OR btrim(payment_method_default) = ''
    OR lower(btrim(payment_method_default)) = 'none';

UPDATE invoices
   SET payment_method_default = 'Check'
 WHERE payment_method_default IS NULL
    OR btrim(payment_method_default) = ''
    OR lower(btrim(payment_method_default)) = 'none';

-- 2. Default for inserts that omit the column.
ALTER TABLE quotes   ALTER COLUMN payment_method_default SET DEFAULT 'Check';
ALTER TABLE invoices ALTER COLUMN payment_method_default SET DEFAULT 'Check';

-- 3. Coerce anything empty-ish on the way in.
CREATE OR REPLACE FUNCTION public.default_payment_method()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method_default IS NULL
     OR btrim(NEW.payment_method_default) = ''
     OR lower(btrim(NEW.payment_method_default)) = 'none' THEN
    NEW.payment_method_default := 'Check';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_default_payment_method ON public.quotes;
CREATE TRIGGER quotes_default_payment_method
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.default_payment_method();

DROP TRIGGER IF EXISTS invoices_default_payment_method ON public.invoices;
CREATE TRIGGER invoices_default_payment_method
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.default_payment_method();
