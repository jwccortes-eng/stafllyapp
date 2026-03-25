-- Fix the overly permissive admin policy — restrict to INSERT/UPDATE only with proper checks
DROP POLICY IF EXISTS "Admins can manage patterns" ON public.reconciliation_known_patterns;
CREATE POLICY "Admins can insert patterns" ON public.reconciliation_known_patterns
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins can update patterns" ON public.reconciliation_known_patterns
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins can delete patterns" ON public.reconciliation_known_patterns
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND company_id IN (SELECT public.user_company_ids(auth.uid())));