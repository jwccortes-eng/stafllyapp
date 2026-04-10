
-- 1. Add unique constraint (company_id, employer_identification) — skip NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_employer_id
  ON public.employees (company_id, employer_identification)
  WHERE employer_identification IS NOT NULL AND employer_identification != '';

-- 2. Replace the trigger function to use per-company config
CREATE OR REPLACE FUNCTION public.auto_assign_employer_identification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_id integer;
  config_val jsonb;
  start_number integer := 1;
  prefix_val text := '';
  padding_val integer := 0;
BEGIN
  -- Only assign if not already set
  IF NEW.employer_identification IS NOT NULL AND NEW.employer_identification != '' THEN
    RETURN NEW;
  END IF;

  -- Read per-company config
  SELECT value INTO config_val
    FROM company_settings
   WHERE company_id = NEW.company_id AND key = 'employee_number_config';

  IF config_val IS NOT NULL THEN
    start_number := COALESCE((config_val->>'start_number')::integer, 1);
    prefix_val := COALESCE(config_val->>'prefix', '');
    padding_val := COALESCE((config_val->>'padding')::integer, 0);
  END IF;

  -- Get next number scoped to this company only
  SELECT COALESCE(MAX(
    CASE 
      WHEN employer_identification ~ '^\d+$' THEN employer_identification::integer
      -- Strip known prefix before parsing
      WHEN prefix_val != '' AND employer_identification LIKE prefix_val || '%' 
           AND replace(employer_identification, prefix_val, '') ~ '^\d+$'
        THEN replace(employer_identification, prefix_val, '')::integer
      ELSE 0 
    END
  ), start_number - 1) + 1
  INTO next_id
  FROM public.employees
  WHERE company_id = NEW.company_id;

  -- Ensure we never go below the configured start
  IF next_id < start_number THEN
    next_id := start_number;
  END IF;

  -- Apply prefix and padding
  IF padding_val > 0 THEN
    NEW.employer_identification := prefix_val || LPAD(next_id::text, padding_val, '0');
  ELSE
    NEW.employer_identification := prefix_val || next_id::text;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Seed config for known companies (upsert via company slug)
INSERT INTO company_settings (company_id, key, value)
SELECT c.id, 'employee_number_config', '{"start_number": 1200, "prefix": "", "padding": 0}'::jsonb
FROM companies c WHERE c.slug = 'quality-staff-by-keury-llc'
ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO company_settings (company_id, key, value)
SELECT c.id, 'employee_number_config', '{"start_number": 1, "prefix": "", "padding": 3}'::jsonb
FROM companies c WHERE c.slug = 'jkitchen-staff'
ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO company_settings (company_id, key, value)
SELECT c.id, 'employee_number_config', '{"start_number": 1, "prefix": "", "padding": 0}'::jsonb
FROM companies c WHERE c.slug = 'mystaff'
ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
