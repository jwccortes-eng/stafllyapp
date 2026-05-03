
-- Hotfix: Fase A introduced infinite recursion on company_users RLS because
-- the new policies query company_users from within their own USING/WITH CHECK.
-- Replace them with SECURITY DEFINER helper-based policies that bypass RLS,
-- preserving the same privilege boundaries.

CREATE OR REPLACE FUNCTION public.has_exact_company_role(_user_id uuid, _company_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Company owners manage company users" ON public.company_users;
DROP POLICY IF EXISTS "Company admins manage non-privileged users" ON public.company_users;

CREATE POLICY "Company owners manage company users"
ON public.company_users
FOR ALL
USING (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
);

CREATE POLICY "Company admins manage non-privileged users"
ON public.company_users
FOR ALL
USING (
  public.has_exact_company_role(auth.uid(), company_id, 'admin')
  AND role NOT IN ('company_owner','owner','developer','founder')
)
WITH CHECK (
  public.has_exact_company_role(auth.uid(), company_id, 'admin')
  AND role NOT IN ('company_owner','owner','developer','founder')
);
