-- 1) Fix: la validación de solapamiento no debe bloquear un retiro/rechazo.
CREATE OR REPLACE FUNCTION public.prevent_overlapping_shift_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _new_shift RECORD;
  _conflict RECORD;
BEGIN
  -- Retirar o rechazar libera el cupo: nunca puede fallar por solapamiento.
  IF NEW.status IN ('removed', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT id, date, start_time, end_time, title, deleted_at
    INTO _new_shift
    FROM scheduled_shifts
   WHERE id = NEW.shift_id;

  IF NOT FOUND OR _new_shift.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT ss.title, ss.start_time, ss.end_time, ss.shift_code
    INTO _conflict
    FROM shift_assignments sa
    JOIN scheduled_shifts ss ON ss.id = sa.shift_id
   WHERE sa.employee_id = NEW.employee_id
     AND sa.id IS DISTINCT FROM NEW.id
     AND sa.status NOT IN ('rejected', 'removed')
     AND ss.date = _new_shift.date
     AND ss.deleted_at IS NULL
     AND _new_shift.start_time < ss.end_time
     AND _new_shift.end_time > ss.start_time
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'El empleado ya tiene un turno asignado que se solapa: "%" (% - %). No se puede asignar al turno "%" (% - %) el mismo día.',
      _conflict.title, _conflict.start_time::text, _conflict.end_time::text,
      _new_shift.title, _new_shift.start_time::text, _new_shift.end_time::text;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Operación canónica: retirar del turno (soft, auditada, idempotente).
CREATE OR REPLACE FUNCTION public.remove_worker_from_shift(
  p_assignment_id uuid,
  p_reason text DEFAULT NULL,
  p_replacement_employee_id uuid DEFAULT NULL,
  p_source text DEFAULT 'ui'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_a public.shift_assignments;
  v_shift public.scheduled_shifts;
  v_activity int := 0;
  v_hours int := 0;
  v_is_captain boolean := false;
  v_was_driver boolean := false;
  v_next_driver uuid;
  v_required int := 0;
  v_assigned_after int := 0;
  v_confirmed_after int := 0;
  v_before jsonb;
  v_after jsonb;
  v_notif_id uuid;
  v_driver_impact text := 'none';
  v_captain_impact text := 'none';
BEGIN
  SELECT * INTO v_a FROM public.shift_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'removed', false, 'reason', 'assignment_not_found',
      'payroll_protected', true, 'next_action', 'reload'
    );
  END IF;

  IF NOT public.can_manage_shift_company(v_a.company_id) THEN
    RETURN jsonb_build_object(
      'removed', false, 'reason', 'forbidden',
      'assignment_status', v_a.status,
      'payroll_protected', true, 'next_action', 'request_access'
    );
  END IF;

  SELECT * INTO v_shift FROM public.scheduled_shifts WHERE id = v_a.shift_id;
  IF NOT FOUND OR v_shift.company_id <> v_a.company_id THEN
    RETURN jsonb_build_object(
      'removed', false, 'reason', 'shift_not_found',
      'payroll_protected', true, 'next_action', 'reload'
    );
  END IF;

  v_required := COALESCE(v_shift.slots, 0);

  -- Idempotencia: ya retirada → no duplicar auditoría ni notificaciones.
  IF v_a.status = 'removed' THEN
    SELECT
      count(*) FILTER (WHERE sa.status NOT IN ('removed','rejected')),
      count(*) FILTER (WHERE sa.status NOT IN ('removed','rejected')
        AND (sa.status = 'confirmed' OR sa.response_status = 'accepted')
        AND COALESCE(sa.response_status,'') <> 'needs_reacceptance')
      INTO v_assigned_after, v_confirmed_after
    FROM public.shift_assignments sa WHERE sa.shift_id = v_a.shift_id;

    RETURN jsonb_build_object(
      'removed', true, 'reason', 'already_removed',
      'assignment_status', v_a.status,
      'coverage_after', jsonb_build_object(
        'required', v_required, 'assigned_active', v_assigned_after, 'confirmed', v_confirmed_after),
      'driver_impact', 'none', 'captain_impact', 'none',
      'payroll_protected', true, 'next_action', 'none'
    );
  END IF;

  -- Actividad real: fichajes u horas. Nunca se alteran.
  SELECT count(*) INTO v_activity FROM public.clock_events ce
   WHERE ce.shift_id = v_a.shift_id AND ce.employee_id = v_a.employee_id;
  SELECT count(*) INTO v_hours FROM public.time_entries te
   WHERE te.shift_id = v_a.shift_id AND te.employee_id = v_a.employee_id;

  IF (v_activity + v_hours) > 0 THEN
    RETURN jsonb_build_object(
      'removed', false, 'reason', 'has_real_activity',
      'assignment_status', v_a.status,
      'payroll_protected', true,
      'next_action', 'manage_exit_or_replacement'
    );
  END IF;

  -- Responsable del turno: exige reemplazo explícito.
  v_is_captain := v_shift.shift_admin_id IS NOT NULL
              AND v_shift.shift_admin_id = v_a.employee_id;

  IF v_is_captain AND p_replacement_employee_id IS NULL THEN
    RETURN jsonb_build_object(
      'removed', false, 'reason', 'captain_requires_replacement',
      'assignment_status', v_a.status,
      'captain_impact', 'blocked',
      'payroll_protected', true,
      'next_action', 'select_replacement_captain'
    );
  END IF;

  IF v_is_captain AND p_replacement_employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.shift_assignments sa
       WHERE sa.shift_id = v_a.shift_id
         AND sa.employee_id = p_replacement_employee_id
         AND sa.status NOT IN ('removed','rejected')
    ) THEN
      RETURN jsonb_build_object(
        'removed', false, 'reason', 'replacement_not_assigned',
        'assignment_status', v_a.status,
        'captain_impact', 'blocked',
        'payroll_protected', true,
        'next_action', 'select_replacement_captain'
      );
    END IF;
  END IF;

  v_was_driver := COALESCE(v_a.assignment_role, '') = 'driver'
               OR v_shift.driver_employee_id = v_a.employee_id;

  v_before := jsonb_build_object(
    'status', v_a.status, 'response_status', v_a.response_status,
    'assignment_role', v_a.assignment_role
  );

  UPDATE public.shift_assignments
     SET status = 'removed',
         assignment_role = CASE WHEN assignment_role = 'driver' THEN 'worker' ELSE assignment_role END,
         rejection_reason = COALESCE(p_reason, rejection_reason)
   WHERE id = p_assignment_id
  RETURNING * INTO v_a;

  -- Capitán: transferir responsabilidad antes de cerrar.
  IF v_is_captain THEN
    UPDATE public.scheduled_shifts
       SET shift_admin_id = p_replacement_employee_id
     WHERE id = v_shift.id;
    v_captain_impact := 'transferred';
  END IF;

  -- Driver: sincronizar el campo legado con el siguiente conductor activo.
  IF v_was_driver THEN
    SELECT sa.employee_id INTO v_next_driver
      FROM public.shift_assignments sa
     WHERE sa.shift_id = v_a.shift_id
       AND sa.assignment_role = 'driver'
       AND sa.status NOT IN ('removed','rejected')
     ORDER BY sa.created_at
     LIMIT 1;

    UPDATE public.scheduled_shifts
       SET driver_employee_id = v_next_driver
     WHERE id = v_shift.id;

    v_driver_impact := CASE WHEN v_next_driver IS NULL THEN 'no_driver_left' ELSE 'reassigned' END;
  END IF;

  SELECT
    count(*) FILTER (WHERE sa.status NOT IN ('removed','rejected')),
    count(*) FILTER (WHERE sa.status NOT IN ('removed','rejected')
      AND (sa.status = 'confirmed' OR sa.response_status = 'accepted')
      AND COALESCE(sa.response_status,'') <> 'needs_reacceptance')
    INTO v_assigned_after, v_confirmed_after
  FROM public.shift_assignments sa WHERE sa.shift_id = v_a.shift_id;

  v_after := jsonb_build_object(
    'status', v_a.status, 'response_status', v_a.response_status,
    'assignment_role', v_a.assignment_role,
    'driver_impact', v_driver_impact, 'captain_impact', v_captain_impact
  );

  v_notif_id := public.create_shift_worker_notification(
    v_a.company_id, v_a.employee_id, v_a.shift_id, v_a.id,
    'shift_assignment', 'Retirado del turno',
    'Ya no formas parte de este turno. Consulta con la oficina si tienes dudas.',
    p_source
  );

  INSERT INTO public.shift_audit_log(
    company_id, shift_id, assignment_id, employee_id, actor_user_id,
    action, before_data, after_data, reason, source
  ) VALUES (
    v_a.company_id, v_a.shift_id, v_a.id, v_a.employee_id, auth.uid(),
    'assignment_removed',
    v_before,
    v_after || jsonb_build_object('notification_id', v_notif_id),
    p_reason, p_source
  );

  RETURN jsonb_build_object(
    'removed', true, 'reason', 'removed',
    'assignment_status', v_a.status,
    'coverage_after', jsonb_build_object(
      'required', v_required, 'assigned_active', v_assigned_after, 'confirmed', v_confirmed_after),
    'driver_impact', v_driver_impact,
    'captain_impact', v_captain_impact,
    'payroll_protected', true,
    'next_action', CASE
      WHEN v_driver_impact = 'no_driver_left' THEN 'assign_driver'
      WHEN v_assigned_after < v_required THEN 'fill_open_spot'
      ELSE 'none' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_worker_from_shift(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_worker_from_shift(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_worker_from_shift(uuid, text, uuid, text) TO service_role;