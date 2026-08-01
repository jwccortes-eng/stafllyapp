ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION public.cancel_shift(
  p_shift_id uuid,
  p_reason text,
  p_company_id uuid DEFAULT NULL,
  p_expected_status text DEFAULT NULL,
  p_cancellation_scope text DEFAULT 'this_shift',
  p_acknowledge_activity boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL,
  p_source text DEFAULT 'ui'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_shift            public.scheduled_shifts;
  v_reason           text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_assigned         int := 0;
  v_confirmed        int := 0;
  v_time_entries     int := 0;
  v_clock_events     int := 0;
  v_approved_hours   int := 0;
  v_adjustments      int := 0;
  v_closeout_final   int := 0;
  v_started          boolean := false;
  v_notified         int := 0;
  v_rows             int := 0;
  v_emp              RECORD;
  v_final_reason     text;
BEGIN
  IF p_shift_id IS NULL THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'shift_not_found',
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'reload');
  END IF;

  SELECT * INTO v_shift FROM public.scheduled_shifts
   WHERE id = p_shift_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'shift_not_found',
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'reload');
  END IF;

  -- Tenant fail-closed
  IF p_company_id IS NOT NULL AND p_company_id <> v_shift.company_id THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'tenant_mismatch',
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'reload');
  END IF;

  IF NOT public.can_manage_shift_company(v_shift.company_id) THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'forbidden',
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'request_access');
  END IF;

  -- Only per-shift scope is supported by the current model (no recurrence series column).
  IF COALESCE(p_cancellation_scope, 'this_shift') <> 'this_shift' THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'scope_not_supported',
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'cancel_single_shift');
  END IF;

  -- Idempotency: already cancelled
  IF v_shift.status = 'cancelled' THEN
    SELECT count(*) INTO v_assigned FROM shift_assignments
      WHERE shift_id = v_shift.id AND status NOT IN ('removed','rejected');
    RETURN jsonb_build_object(
      'cancelled', true, 'reason', 'already_cancelled',
      'previous_status', 'cancelled', 'final_status', 'cancelled',
      'affected_assignments', v_assigned, 'notified_workers', 0,
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'none');
  END IF;

  IF p_expected_status IS NOT NULL AND p_expected_status <> v_shift.status THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'status_conflict',
      'previous_status', v_shift.status, 'final_status', v_shift.status,
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'reload');
  END IF;

  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'reason_required',
      'previous_status', v_shift.status, 'final_status', v_shift.status,
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'provide_reason');
  END IF;

  SELECT count(*) FILTER (WHERE status NOT IN ('removed','rejected')),
         count(*) FILTER (WHERE status = 'confirmed'
                            AND COALESCE(response_status,'') <> 'needs_reacceptance')
    INTO v_assigned, v_confirmed
    FROM shift_assignments WHERE shift_id = v_shift.id;

  SELECT count(*) INTO v_time_entries FROM time_entries WHERE shift_id = v_shift.id;
  SELECT count(*) INTO v_approved_hours FROM time_entries
    WHERE shift_id = v_shift.id AND status = 'approved';
  SELECT count(*) INTO v_clock_events FROM clock_events WHERE shift_id = v_shift.id;
  SELECT count(*) INTO v_adjustments FROM payroll_adjustments WHERE shift_id = v_shift.id;
  SELECT count(*) INTO v_closeout_final FROM shift_closeout_reports
    WHERE shift_id = v_shift.id AND final_approval_status = 'approved';

  -- CASO E — payroll procesado o turno bloqueado: fail-closed, sin cambios
  IF v_shift.status = 'locked' OR v_approved_hours > 0 OR v_adjustments > 0 OR v_closeout_final > 0 THEN
    RETURN jsonb_build_object(
      'cancelled', false, 'reason', 'payroll_locked',
      'previous_status', v_shift.status, 'final_status', v_shift.status,
      'affected_assignments', v_assigned, 'notified_workers', 0,
      'payroll_protected', true, 'hours_preserved', true,
      'next_action', 'administrative_review');
  END IF;

  v_started := (v_shift.date::date + COALESCE(v_shift.start_time, '00:00'::time)) <= (now() AT TIME ZONE 'UTC');

  -- CASO C / D — actividad real o turno iniciado: exige confirmación reforzada
  IF (v_time_entries > 0 OR v_clock_events > 0 OR v_started) AND NOT COALESCE(p_acknowledge_activity, false) THEN
    RETURN jsonb_build_object(
      'cancelled', false,
      'reason', CASE WHEN (v_time_entries > 0 OR v_clock_events > 0)
                     THEN 'requires_activity_acknowledgement'
                     ELSE 'requires_started_acknowledgement' END,
      'previous_status', v_shift.status, 'final_status', v_shift.status,
      'affected_assignments', v_assigned, 'notified_workers', 0,
      'payroll_protected', true, 'hours_preserved', true,
      'next_action', 'confirm_with_activity');
  END IF;

  v_final_reason := CASE
    WHEN v_time_entries > 0 OR v_clock_events > 0 THEN 'cancelled_during_operation'
    WHEN v_started THEN 'cancelled_after_start'
    ELSE 'cancelled' END;

  UPDATE public.scheduled_shifts
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = v_reason
   WHERE id = v_shift.id AND status <> 'cancelled';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'not_persisted',
      'previous_status', v_shift.status, 'final_status', v_shift.status,
      'payroll_protected', true, 'hours_preserved', true, 'next_action', 'retry');
  END IF;

  -- FASE 5: no se borra ni se reescribe el estado de las asignaciones.
  -- Sólo se apaga la exigencia de respuesta para que no haya recordatorios.
  UPDATE shift_assignments
     SET response_required = false
   WHERE shift_id = v_shift.id
     AND status NOT IN ('removed','rejected')
     AND COALESCE(response_required, false) = true;

  -- FASE 6: notificación única por worker (anti-ráfaga: 1h)
  FOR v_emp IN
    SELECT DISTINCT employee_id FROM shift_assignments
     WHERE shift_id = v_shift.id AND status NOT IN ('removed','rejected')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM notifications n
       WHERE n.recipient_id = v_emp.employee_id
         AND n.type = 'shift_cancelled'
         AND n.metadata->>'shift_id' = v_shift.id::text
         AND n.created_at > now() - interval '1 hour'
    ) THEN
      BEGIN
        INSERT INTO notifications (company_id, recipient_id, recipient_type, type, title, body, metadata, created_by)
        VALUES (
          v_shift.company_id, v_emp.employee_id, 'employee', 'shift_cancelled',
          'Turno cancelado',
          'El turno ' || COALESCE(v_shift.shift_ref, v_shift.title, '')
            || ' del ' || to_char(v_shift.date::date, 'DD Mon')
            || ' fue cancelado. No debes presentarte. Consulta los detalles en Stafly.',
          jsonb_build_object('shift_id', v_shift.id, 'source', COALESCE(p_source,'ui'),
                             'action', 'review_shift'),
          auth.uid()
        );
        v_notified := v_notified + 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  INSERT INTO shift_audit_log (company_id, shift_id, actor_user_id, action, before_data, after_data, reason, source)
  VALUES (
    v_shift.company_id, v_shift.id, auth.uid(), 'shift_cancelled',
    jsonb_build_object('status', v_shift.status, 'assigned_active', v_assigned, 'confirmed', v_confirmed),
    jsonb_build_object('status', 'cancelled', 'classification', v_final_reason,
                       'time_entries', v_time_entries, 'clock_events', v_clock_events,
                       'notified_workers', v_notified, 'idempotency_key', p_idempotency_key),
    v_reason, COALESCE(p_source, 'ui')
  );

  RETURN jsonb_build_object(
    'cancelled', true, 'reason', v_final_reason,
    'previous_status', v_shift.status, 'final_status', 'cancelled',
    'affected_assignments', v_assigned, 'confirmed_before', v_confirmed,
    'notified_workers', v_notified,
    'payroll_protected', true, 'hours_preserved', true,
    'time_entries_preserved', v_time_entries,
    'next_action', CASE WHEN v_time_entries > 0 OR v_clock_events > 0
                        THEN 'review_hours_in_validation_center' ELSE 'none' END);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_shift(uuid, text, uuid, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_shift(uuid, text, uuid, text, text, boolean, text, text) TO authenticated, service_role;