-- Allow employees to self-update their own record (used by the new portal "Complete profile" wizard).
-- Mirrors the existing "Employees can update own avatar" policy but covers the rest of the
-- personal-info fields gated by compute_employee_profile_status (DOB, SSN last4, address, role).
-- RLS row scope only — column-level filtering is handled in application code.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.employees'::regclass
      AND polname = 'Employees can update own profile'
  ) THEN
    CREATE POLICY "Employees can update own profile"
      ON public.employees
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;