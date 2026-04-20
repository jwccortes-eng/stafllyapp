
-- =========================================================
-- 1) COMPANIES: stop exposing invite_code / billing fields
-- =========================================================

-- Drop the over-permissive public SELECT policy
DROP POLICY IF EXISTS "Public can view active companies" ON public.companies;

-- Recreate a SELECT policy for AUTHENTICATED company members / global owners only.
-- (Anon will get nothing from the table directly; they go through the safe view + RPC below.)
CREATE POLICY "Company members can view their companies"
ON public.companies
FOR SELECT
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = companies.id AND cu.user_id = auth.uid()
  )
);

-- Public-safe view: ONLY non-sensitive branding fields, for anon + authenticated.
-- security_invoker so RLS on underlying table still applies for sensitive operations.
CREATE OR REPLACE VIEW public.companies_public
WITH (security_invoker = on) AS
SELECT
  id,
  name,
  slug,
  logo_url,
  brand_color,
  application_enabled,
  application_intro,
  application_cover_url,
  is_active
FROM public.companies
WHERE is_active = true;

-- Allow anon + authenticated read on the safe view (RLS on companies blocks the view by default
-- because security_invoker = on; we re-allow by adding a permissive SELECT policy that ONLY
-- returns rows when called through the view's expected use cases — i.e. is_active = true).
-- Since views can't have their own RLS, we add a narrow policy on companies that exposes
-- ONLY the safe columns is impossible in PG; instead we add a permissive policy that allows
-- SELECT only when the caller is reading via the view (we approximate by allowing anon to
-- read active rows but the view restricts columns). To prevent column-level leakage we add
-- column-level GRANTs.

-- Column-level grants: anon/authenticated can only SELECT safe columns from companies directly.
REVOKE SELECT ON public.companies FROM anon, authenticated;
GRANT SELECT (
  id, name, slug, logo_url, brand_color,
  application_enabled, application_intro, application_cover_url, is_active
) ON public.companies TO anon, authenticated;

-- Re-grant full SELECT to service_role and postgres so server-side code still works
GRANT SELECT ON public.companies TO service_role, postgres;

-- Permissive SELECT for anon on active companies (limited by column grants above)
CREATE POLICY "Anon can view active company branding"
ON public.companies
FOR SELECT
TO anon
USING (is_active = true);

-- Grant view access
GRANT SELECT ON public.companies_public TO anon, authenticated;

-- =========================================================
-- 2) RPC: safe invite-code lookup for /join/:inviteCode
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_company_by_invite_code(_invite_code text)
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  brand_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.logo_url, c.brand_color
  FROM public.companies c
  WHERE upper(c.invite_code) = upper(_invite_code)
    AND c.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_by_invite_code(text) TO anon, authenticated;

-- =========================================================
-- 3) STORAGE: remove broad payroll-truth-files policies
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can read truth files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload truth files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete truth files" ON storage.objects;

-- The "Company admins can ..." policies already exist and are correctly scoped.
-- Nothing else to add.
