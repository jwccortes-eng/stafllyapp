-- ============================================================
-- P0 — SEBASTIÁN DOMAIN BOUNDARY REMEDIATION
-- Separa SERVICES/SHIFTS de TIME & CLOSEOUT y de BILLING.
-- Sin cambios de datos, ni de payroll, ni de roles/overrides.
-- ============================================================

-- 1) TIME_ENTRIES — autoridad por permisos del dominio de horas ---------------
DROP POLICY IF EXISTS "Managers can view time_entries" ON public.time_entries;
CREATE POLICY "Time domain can view time_entries"
  ON public.time_entries FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_permission(auth.uid(), company_id, 'time_entries.view')
  );

DROP POLICY IF EXISTS "Managers can edit time_entries" ON public.time_entries;
CREATE POLICY "Time domain can edit time_entries"
  ON public.time_entries FOR UPDATE
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_permission(auth.uid(), company_id, 'time_entries.adjust')
  );

DROP POLICY IF EXISTS "Managers can insert time_entries" ON public.time_entries;
CREATE POLICY "Time domain can insert time_entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_permission(auth.uid(), company_id, 'time_entries.adjust')
  );

-- Membresía + app_role global 'admin' ya no gobierna horas.
DROP POLICY IF EXISTS "Company admins can manage time_entries" ON public.time_entries;
CREATE POLICY "Time domain can delete time_entries"
  ON public.time_entries FOR DELETE
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_permission(auth.uid(), company_id, 'time_entries.adjust')
  );

-- 2) ASISTENCIA — dominio de horas, no de servicios --------------------------
DROP POLICY IF EXISTS "Managers with shifts edit can manage attendance"
  ON public.shift_attendance_confirmations;
DROP POLICY IF EXISTS "Admins can manage company attendance confirmations"
  ON public.shift_attendance_confirmations;
CREATE POLICY "Time domain can manage attendance confirmations"
  ON public.shift_attendance_confirmations FOR ALL
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_permission(auth.uid(), company_id, 'time_entries.review')
  )
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_permission(auth.uid(), company_id, 'time_entries.review')
  );

-- 3) CORRECCIÓN DE HORAS — fuera can_manage_shift_company --------------------
CREATE OR REPLACE FUNCTION public.can_request_shift_correction(_company_id uuid, _shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_permission(auth.uid(), _company_id, 'time_entries.review')
    OR public.has_permission(auth.uid(), _company_id, 'time_entries.adjust')
    OR EXISTS (
      SELECT 1
      FROM public.scheduled_shifts s
      JOIN public.employees e ON e.id = s.shift_admin_id
      WHERE s.id = _shift_id
        AND s.company_id = _company_id
        AND e.user_id = auth.uid()
    );
$function$;

-- 4) CIERRE ADMINISTRATIVO — permiso explícito, no membresía -----------------
CREATE OR REPLACE FUNCTION public.shift_closeout_can_admin(_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_global_owner(auth.uid())
    OR (
      _company IS NOT NULL AND (
        public.is_company_owner(auth.uid(), _company)
        OR public.has_permission(auth.uid(), _company, 'closeout.close_day')
        OR public.has_permission(auth.uid(), _company, 'closeout.reopen_day')
        OR public.has_permission(auth.uid(), _company, 'time_entries.approve')
      )
    );
$function$;

-- 5) BILLING — nunca por membresía -------------------------------------------
DROP POLICY IF EXISTS "invoices_select_company_members" ON public.invoices;
CREATE POLICY "invoices_select_admins" ON public.invoices FOR SELECT
  USING (public.user_is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "invoice_lines_select_via_parent" ON public.invoice_lines;
CREATE POLICY "invoice_lines_select_via_parent_admin" ON public.invoice_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_is_company_admin(auth.uid(), i.company_id)
  ));

DROP POLICY IF EXISTS "invoice_payments_select_company_members" ON public.invoice_payments;
CREATE POLICY "invoice_payments_select_admins" ON public.invoice_payments FOR SELECT
  USING (public.user_is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "invoice_activity_log_select_company_members" ON public.invoice_activity_log;
CREATE POLICY "invoice_activity_log_select_admins" ON public.invoice_activity_log FOR SELECT
  USING (public.user_is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "bsb_select_company_members" ON public.billable_service_blocks;
CREATE POLICY "bsb_select_admins" ON public.billable_service_blocks FOR SELECT
  USING (public.user_is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "bsbe_select_via_parent" ON public.billable_service_block_entries;
CREATE POLICY "bsbe_select_via_parent_admin" ON public.billable_service_block_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.billable_service_blocks b
    WHERE b.id = billable_service_block_entries.service_block_id
      AND public.user_is_company_admin(auth.uid(), b.company_id)
  ));

DROP POLICY IF EXISTS "billing_client_locations_select_company_members" ON public.billing_client_locations;
CREATE POLICY "billing_client_locations_select_admins" ON public.billing_client_locations FOR SELECT
  USING (public.user_is_company_admin(auth.uid(), company_id));
