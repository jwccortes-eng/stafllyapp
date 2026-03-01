
-- Drop duplicate policies first, then recreate
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Company members can view co-member profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owners can view all profiles" ON public.profiles;

-- Create restrictive profile policies
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Company members can view co-member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_users cu1
    JOIN company_users cu2 ON cu1.company_id = cu2.company_id
    WHERE cu1.user_id = auth.uid() AND cu2.user_id = profiles.user_id
  )
);

CREATE POLICY "Owners can view all profiles"
ON public.profiles
FOR SELECT
USING (is_global_owner(auth.uid()));
