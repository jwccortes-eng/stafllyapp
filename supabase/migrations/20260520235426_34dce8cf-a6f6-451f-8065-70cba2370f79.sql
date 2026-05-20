
-- =========================================================
-- Security hardening Phase 1 — RLS tightening
-- Findings #1, #2, #7
-- No payroll/time_entries/shifts/notifications touched.
-- =========================================================

-- ---- M1. auth_rate_limits: remove broad admin SELECT ----
DROP POLICY IF EXISTS "Admins can view rate limits" ON public.auth_rate_limits;
-- "Owners can view rate limits" (is_global_owner) + "Service role only - no anon access" remain.

-- ---- M2. Compensation / pay-rate tables: replace broad member SELECT with admin/payroll gate ----

-- company_compensation_rules (no employee_id; pure company-level)
DROP POLICY IF EXISTS comp_rules_select ON public.company_compensation_rules;
CREATE POLICY comp_rules_select_admin ON public.company_compensation_rules
  FOR SELECT TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR is_company_owner(auth.uid(), company_id)
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );

-- compensation_analysis_summary (has employee_id — keep self-read for workers)
DROP POLICY IF EXISTS comp_analysis_select ON public.compensation_analysis_summary;
CREATE POLICY comp_analysis_select_admin ON public.compensation_analysis_summary
  FOR SELECT TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR is_company_owner(auth.uid(), company_id)
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );
CREATE POLICY comp_analysis_select_self ON public.compensation_analysis_summary
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = compensation_analysis_summary.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- compensation_change_log (has employee_id — keep self-read)
DROP POLICY IF EXISTS comp_changelog_select ON public.compensation_change_log;
CREATE POLICY comp_changelog_select_admin ON public.compensation_change_log
  FOR SELECT TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR is_company_owner(auth.uid(), company_id)
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );
CREATE POLICY comp_changelog_select_self ON public.compensation_change_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = compensation_change_log.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- payroll_rate_snapshots (has employee_id — keep self-read)
DROP POLICY IF EXISTS rate_snapshots_select ON public.payroll_rate_snapshots;
CREATE POLICY rate_snapshots_select_admin ON public.payroll_rate_snapshots
  FOR SELECT TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR is_company_owner(auth.uid(), company_id)
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );
CREATE POLICY rate_snapshots_select_self ON public.payroll_rate_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_rate_snapshots.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- ---- M3. locations_v2: remove unscoped has_role(admin) on write/read ----
DROP POLICY IF EXISTS "locations_v2 read by company members" ON public.locations_v2;
CREATE POLICY "locations_v2 read by company members" ON public.locations_v2
  FOR SELECT TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR (company_id IN (SELECT user_company_ids(auth.uid())))
  );

DROP POLICY IF EXISTS "locations_v2 insert by company admins" ON public.locations_v2;
CREATE POLICY "locations_v2 insert by company admins" ON public.locations_v2
  FOR INSERT TO authenticated
  WITH CHECK (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "locations_v2 update by company admins" ON public.locations_v2;
CREATE POLICY "locations_v2 update by company admins" ON public.locations_v2
  FOR UPDATE TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "locations_v2 delete by company admins" ON public.locations_v2;
CREATE POLICY "locations_v2 delete by company admins" ON public.locations_v2
  FOR DELETE TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
  );
