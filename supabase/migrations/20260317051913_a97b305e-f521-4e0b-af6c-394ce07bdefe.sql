
-- Drop the insecure anonymous policy
DROP POLICY IF EXISTS "Anon can read badges" ON public.employee_badges;

-- Create a secure policy: only authenticated users can read badges from their own company
CREATE POLICY "Authenticated users can read company badges"
ON public.employee_badges
FOR SELECT
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
);
