
-- Fix the overly permissive FOR ALL policy on company_financial_policies
DROP POLICY IF EXISTS "financial_policies_upsert" ON public.company_financial_policies;

CREATE POLICY "financial_policies_insert" ON public.company_financial_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_policies_update" ON public.company_financial_policies
  FOR UPDATE TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );
