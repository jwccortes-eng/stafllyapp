
-- P1: review_scores tenant-scope hardening
-- Replaces cross-tenant has_role() bypass with has_company_role() gate.
-- is_global_owner (owner/developer) bypass intentionally PRESERVED inside has_company_role
-- for Control Tower / support access. Future debt: break-glass support access with audit log.

BEGIN;

-- INSERT
DROP POLICY IF EXISTS "rsc_insert" ON public.review_scores;
CREATE POLICY "rsc_insert" ON public.review_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IS NOT NULL
    AND public.has_company_role(auth.uid(), company_id, 'admin')
  );

-- UPDATE (adds WITH CHECK to block company_id A->B mutation)
DROP POLICY IF EXISTS "rsc_update" ON public.review_scores;
CREATE POLICY "rsc_update" ON public.review_scores
  FOR UPDATE TO authenticated
  USING (
    company_id IS NOT NULL
    AND public.has_company_role(auth.uid(), company_id, 'admin')
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND public.has_company_role(auth.uid(), company_id, 'admin')
  );

-- DELETE (explicit, restricted to global owner/developer)
DROP POLICY IF EXISTS "rsc_delete" ON public.review_scores;
CREATE POLICY "rsc_delete" ON public.review_scores
  FOR DELETE TO authenticated
  USING (
    public.is_global_owner(auth.uid())
  );

-- SELECT: unchanged (rsc_select already tenant-scoped via company_users + is_global_owner)

COMMIT;
