
-- Fix overly permissive RLS policies

-- 1. demo_requests: public INSERT is intentional (landing page form), but restrict to anon/authenticated only
DROP POLICY IF EXISTS "Anyone can submit demo request" ON public.demo_requests;
CREATE POLICY "Anyone can submit demo request" ON public.demo_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 2. review_flags: should only be inserted by triggers/system, restrict to authenticated admins
DROP POLICY IF EXISTS "rf_insert" ON public.review_flags;
CREATE POLICY "rf_insert" ON public.review_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- 3. review_requests: restrict INSERT to authenticated admin/manager
DROP POLICY IF EXISTS "rr_insert" ON public.review_requests;
CREATE POLICY "rr_insert" ON public.review_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM company_users WHERE user_id = auth.uid() AND company_id = review_requests.company_id AND role IN ('admin','manager'))
  );

-- 4. review_scores: restrict INSERT/UPDATE to authenticated admins or system
DROP POLICY IF EXISTS "rsc_insert" ON public.review_scores;
CREATE POLICY "rsc_insert" ON public.review_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "rsc_update" ON public.review_scores;
CREATE POLICY "rsc_update" ON public.review_scores
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );
