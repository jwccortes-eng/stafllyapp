CREATE OR REPLACE FUNCTION public.can_request_shift_correction(_company_id uuid, _shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.can_manage_shift_company(_company_id)
    OR public.has_permission(auth.uid(), _company_id, 'time_entries.review')
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

CREATE OR REPLACE FUNCTION public.list_shift_corrections(p_shift_id uuid)
RETURNS TABLE(pending_time_entry_id uuid, company_id uuid, shift_id uuid, employee_id uuid, correction_type text, status text, proposed_clock_in timestamp with time zone, proposed_clock_out timestamp with time zone, original_clock_in timestamp with time zone, original_clock_out timestamp with time zone, target_time_entry_id uuid, reason text, note text, requested_by uuid, requested_at timestamp with time zone, reviewed_at timestamp with time zone, approved_by uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH req AS (
    SELECT
      (after_data->>'pending_time_entry_id')::uuid AS pending_id,
      (after_data->>'target_time_entry_id')::uuid AS target_id,
      after_data->>'correction_type' AS correction_type,
      after_data->>'note' AS note,
      before_data,
      actor_user_id AS requested_by,
      created_at AS requested_at,
      reason
    FROM public.shift_audit_log
    WHERE shift_id = p_shift_id
      AND action = 'time_entry.correction_requested'
  )
  SELECT
    te.id AS pending_time_entry_id,
    te.company_id,
    te.shift_id,
    te.employee_id,
    r.correction_type,
    te.status,
    te.clock_in  AS proposed_clock_in,
    te.clock_out AS proposed_clock_out,
    (r.before_data->>'clock_in')::timestamptz  AS original_clock_in,
    (r.before_data->>'clock_out')::timestamptz AS original_clock_out,
    r.target_id AS target_time_entry_id,
    r.reason,
    r.note,
    r.requested_by,
    r.requested_at,
    te.approved_at AS reviewed_at,
    te.approved_by
  FROM public.time_entries te
  JOIN req r ON r.pending_id = te.id
  WHERE te.shift_id = p_shift_id
    AND te.status IN ('pending_correction','rejected')
    AND public.can_request_shift_correction(te.company_id, te.shift_id);
$function$;