-- Fase A: Privilege escalation hardening
-- user_roles + company_users RLS lockdown

-- ============ user_roles ============
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins manage non-privileged roles"
ON public.user_roles
FOR ALL
USING (
  public.is_global_owner(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role <> ALL (ARRAY['owner'::public.app_role, 'developer'::public.app_role, 'founder'::public.app_role])
  )
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role <> ALL (ARRAY['owner'::public.app_role, 'developer'::public.app_role, 'founder'::public.app_role])
  )
);

-- ============ company_users ============
DROP POLICY IF EXISTS "Company admins can manage their company users" ON public.company_users;

-- Company owners (and global owners) manage everyone in their company
CREATE POLICY "Company owners manage company users"
ON public.company_users
FOR ALL
USING (
  public.is_global_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_users.company_id
      AND cu.role = 'company_owner'
  )
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_users.company_id
      AND cu.role = 'company_owner'
  )
);

-- Company admins (exact role 'admin', not company_owner) manage only
-- non-privileged roles within their company. Cannot assign or modify
-- company_owner/owner/developer/founder rows.
CREATE POLICY "Company admins manage non-privileged users"
ON public.company_users
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_users.company_id
      AND cu.role = 'admin'
  )
  AND role NOT IN ('company_owner','owner','developer','founder')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_users.company_id
      AND cu.role = 'admin'
  )
  AND role NOT IN ('company_owner','owner','developer','founder')
);
