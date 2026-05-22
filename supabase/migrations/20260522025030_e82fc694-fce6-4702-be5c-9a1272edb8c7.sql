-- Worker W-9 Guided Form v1: additive columns on contractor_w9 (no raw SSN/EIN)
ALTER TABLE public.contractor_w9
  ADD COLUMN IF NOT EXISTS tax_id_type text,
  ADD COLUMN IF NOT EXISTS llc_tax_classification text,
  ADD COLUMN IF NOT EXISTS exempt_payee_code text,
  ADD COLUMN IF NOT EXISTS fatca_code text,
  ADD COLUMN IF NOT EXISTS account_numbers text,
  ADD COLUMN IF NOT EXISTS signature_name text,
  ADD COLUMN IF NOT EXISTS certification_accepted boolean NOT NULL DEFAULT false;

ALTER TABLE public.contractor_w9
  DROP CONSTRAINT IF EXISTS contractor_w9_tax_id_type_check;
ALTER TABLE public.contractor_w9
  ADD CONSTRAINT contractor_w9_tax_id_type_check
    CHECK (tax_id_type IS NULL OR tax_id_type IN ('ssn','ein'));

ALTER TABLE public.contractor_w9
  DROP CONSTRAINT IF EXISTS contractor_w9_llc_class_check;
ALTER TABLE public.contractor_w9
  ADD CONSTRAINT contractor_w9_llc_class_check
    CHECK (llc_tax_classification IS NULL OR llc_tax_classification IN ('C','S','P'));

-- Per Phase 1.5 column-whitelist rule: new public columns need explicit grants.
GRANT SELECT (tax_id_type, llc_tax_classification, exempt_payee_code, fatca_code,
              account_numbers, signature_name, certification_accepted)
  ON public.contractor_w9 TO authenticated;
GRANT INSERT (tax_id_type, llc_tax_classification, exempt_payee_code, fatca_code,
              account_numbers, signature_name, certification_accepted)
  ON public.contractor_w9 TO authenticated;
GRANT UPDATE (tax_id_type, llc_tax_classification, exempt_payee_code, fatca_code,
              account_numbers, signature_name, certification_accepted)
  ON public.contractor_w9 TO authenticated;