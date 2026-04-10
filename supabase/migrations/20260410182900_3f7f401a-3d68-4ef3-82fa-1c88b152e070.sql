
-- Fix UPDATE policy: add WITH CHECK clause (required for UPDATE to succeed)
DROP POLICY IF EXISTS "comp_profiles_update" ON public.compensation_profiles;
CREATE POLICY "comp_profiles_update" ON public.compensation_profiles
FOR UPDATE TO authenticated
USING (
  is_global_owner(auth.uid())
  OR is_company_owner(auth.uid(), company_id)
  OR has_action_permission(auth.uid(), company_id, 'manage_compensation')
)
WITH CHECK (
  is_global_owner(auth.uid())
  OR is_company_owner(auth.uid(), company_id)
  OR has_action_permission(auth.uid(), company_id, 'manage_compensation')
);
