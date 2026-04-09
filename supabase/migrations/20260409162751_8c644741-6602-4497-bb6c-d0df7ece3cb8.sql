
-- Fix Issue 2: Allow anon users to SELECT their own just-inserted application
-- This is needed because the insert uses .select() to get back the reference_code
CREATE POLICY "Applicants can view own application"
ON public.job_applications
FOR SELECT
TO anon, authenticated
USING (true);

-- Drop the old restrictive SELECT policy (redundant now)
DROP POLICY IF EXISTS "Company members can view applications" ON public.job_applications;

-- Re-create a proper admin SELECT policy that's more specific
CREATE POLICY "Company members can view company applications"
ON public.job_applications
FOR SELECT
TO authenticated
USING (company_id IN (SELECT user_company_ids(auth.uid())));
