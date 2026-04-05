
-- 1. Add new columns to employees table
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ssn_last4 text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS can_drive boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_vehicle boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text;

-- 2. Employee archive records table
CREATE TABLE IF NOT EXISTS public.employee_archive_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reason text NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  eligible_for_rehire boolean DEFAULT true,
  archived_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_archive_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view archive records"
  ON public.employee_archive_records FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

CREATE POLICY "Company members can create archive records"
  ON public.employee_archive_records FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

-- 3. Auto-increment employer_identification trigger
CREATE OR REPLACE FUNCTION public.auto_assign_employer_identification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id integer;
BEGIN
  -- Only assign if not already set
  IF NEW.employer_identification IS NOT NULL AND NEW.employer_identification != '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(
    CASE 
      WHEN employer_identification ~ '^\d+$' THEN employer_identification::integer 
      ELSE 0 
    END
  ), 1199) + 1
  INTO next_id
  FROM public.employees
  WHERE company_id = NEW.company_id;

  -- Ensure minimum of 1200
  IF next_id < 1200 THEN
    next_id := 1200;
  END IF;

  NEW.employer_identification := next_id::text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_employer_identification ON public.employees;
CREATE TRIGGER trg_auto_employer_identification
  BEFORE INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_employer_identification();

-- 4. User column preferences
CREATE TABLE IF NOT EXISTS public.user_column_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_key text NOT NULL DEFAULT 'employees',
  visible_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_key)
);

ALTER TABLE public.user_column_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own column preferences"
  ON public.user_column_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
