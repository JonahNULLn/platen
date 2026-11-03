-- ════════════════════════════════════════════════════════════════════
-- Multiple packages per invoice: backfill invoices.shipments.
--
-- Apply AFTER drizzle/0026_brainy_mister_sinister.sql (which adds the
-- `shipments` JSONB column, default '[]').
--
-- Every invoice that already has a tracking number or an actual shipping cost
-- becomes a one-package list, so single-package orders look exactly as before:
--   - carrier  ← shipping_carrier (unknown / NULL → 'other')
--   - trackingNumber ← tracking_number ('' when none)
--   - cost     ← shipping_actual, only on capped-estimate invoices (the only
--                mode where a real cost is entered); NULL otherwise.
--
-- tracking_number / shipping_carrier are left in place: builds deployed before
-- this change share the database and still read them, and the app keeps them
-- mirrored to the first package. Drop them once every deploy reads shipments.
--
-- Re-run-safe: only touches invoices whose shipments list is still empty.
-- ════════════════════════════════════════════════════════════════════
UPDATE public.invoices
SET shipments = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'carrier', CASE
      WHEN shipping_carrier IN ('ups', 'usps', 'fedex', 'other') THEN shipping_carrier
      ELSE 'other'
    END,
    'trackingNumber', COALESCE(tracking_number, ''),
    'cost', CASE
      WHEN shipping_mode = 'estimate' AND shipping_actual IS NOT NULL
        THEN to_jsonb(shipping_actual)
      ELSE 'null'::jsonb
    END
  )
)
WHERE shipments = '[]'::jsonb
  AND (NULLIF(TRIM(tracking_number), '') IS NOT NULL OR shipping_actual IS NOT NULL);
