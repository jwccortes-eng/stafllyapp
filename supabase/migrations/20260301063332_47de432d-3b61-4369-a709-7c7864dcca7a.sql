
-- Fix 1: Drop and recreate employees_safe view WITHOUT sensitive columns
DROP VIEW IF EXISTS public.employees_safe;

CREATE VIEW public.employees_safe AS
SELECT 
  id,
  first_name,
  last_name,
  connecteam_employee_id,
  start_date,
  end_date,
  employee_role,
  direct_manager,
  groups,
  tags,
  company_id,
  user_id,
  is_active,
  created_at,
  updated_at,
  gender
FROM employees;

-- Fix 2: Replace broad profiles policy - restrict to admin/manager only
DROP POLICY IF EXISTS "Company members can view co-member profiles" ON public.profiles;

CREATE POLICY "Admins and managers can view co-member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_users cu1
    JOIN company_users cu2 ON cu1.company_id = cu2.company_id
    WHERE cu1.user_id = auth.uid() AND cu2.user_id = profiles.user_id
  )
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'manager'::app_role)
  )
);

-- Fix 3: Create profiles_safe view for employee-facing code
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT user_id, full_name FROM profiles;
