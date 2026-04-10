
-- Fix SELECT policy to include global owners
DROP POLICY IF EXISTS "comp_profiles_select" ON public.compensation_profiles;
CREATE POLICY "comp_profiles_select" ON public.compensation_profiles
FOR SELECT TO authenticated
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  OR is_global_owner(auth.uid())
);

-- Also fix compensation_change_log SELECT for consistency
DROP POLICY IF EXISTS "comp_changelog_select" ON public.compensation_change_log;
CREATE POLICY "comp_changelog_select" ON public.compensation_change_log
FOR SELECT TO authenticated
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  OR is_global_owner(auth.uid())
);
