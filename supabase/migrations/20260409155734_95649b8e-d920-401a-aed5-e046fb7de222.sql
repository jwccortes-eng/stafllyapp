-- Allow anonymous/public SELECT on companies for public flows (apply, invite, activate)
CREATE POLICY "Public can view active companies"
ON public.companies
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Drop the old restrictive policy that conflicts
DROP POLICY IF EXISTS "Users can view their companies" ON public.companies;