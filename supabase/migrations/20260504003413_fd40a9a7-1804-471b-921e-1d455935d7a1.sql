DROP POLICY IF EXISTS comp_profiles_select ON public.compensation_profiles;

CREATE POLICY comp_profiles_select_admin
ON public.compensation_profiles
FOR SELECT
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR is_company_owner(auth.uid(), company_id)
  OR user_is_company_admin(auth.uid(), company_id)
  OR has_action_permission(auth.uid(), company_id, 'manage_compensation')
);

CREATE POLICY comp_profiles_select_self
ON public.compensation_profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = compensation_profiles.employee_id
      AND e.user_id = auth.uid()
  )
);