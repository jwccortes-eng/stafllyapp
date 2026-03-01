
-- Add auto-incremental company_code
CREATE SEQUENCE IF NOT EXISTS public.company_code_seq START 1;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS company_code integer UNIQUE;

-- Backfill existing companies with codes in creation order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM companies
)
UPDATE companies SET company_code = ordered.rn
FROM ordered WHERE companies.id = ordered.id AND companies.company_code IS NULL;

-- Set sequence to next value
SELECT setval('company_code_seq', COALESCE((SELECT MAX(company_code) FROM companies), 0) + 1);

-- Auto-assign on insert
CREATE OR REPLACE FUNCTION public.auto_assign_company_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_code IS NULL THEN
    NEW.company_code := nextval('public.company_code_seq')::integer;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_auto_company_code
  BEFORE INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_company_code();
