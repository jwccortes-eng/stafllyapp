
ALTER TABLE public.employees
  DROP COLUMN IF EXISTS employer_identification,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS birthday,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS county,
  DROP COLUMN IF EXISTS kiosk_code;
