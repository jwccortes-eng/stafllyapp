-- ============================================================
-- F0.1  Shift change notifications: single route, no duplicates
-- ============================================================
-- BEFORE: trg_material_shift_change (BEFORE UPDATE) and
--         trg_notify_shift_change (AFTER UPDATE) both fired for
--         date/time/location edits -> 2 contradictory notifications.
-- AFTER : handle_material_shift_change owns ALL material-change
--         notifications; notify_employees_on_shift_change owns ONLY
--         cancellation (soft delete). No coverage lost.

CREATE OR REPLACE FUNCTION public.notify_employees_on_shift_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _assignment RECORD;
  _body text;
BEGIN
  -- F0: this trigger now ONLY covers cancellation. Material changes
  -- (date/time/location/title/meeting_point/notes/pay_type) are handled
  -- exclusively by handle_material_shift_change to avoid duplicates.
  IF NOT (TG_OP = 'DELETE' OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)) THEN
    RETURN NEW;
  END IF;

  _body := 'El turno "' || COALESCE(NEW.title, OLD.title) || '" del '
        || to_char(COALESCE(NEW.date, OLD.date)::date, 'DD Mon') || ' ha sido cancelado.';

  FOR _assignment IN
    SELECT employee_id FROM shift_assignments
    WHERE shift_id = COALESCE(NEW.id, OLD.id)
      AND status NOT IN ('rejected', 'removed')
  LOOP
    INSERT INTO notifications (
      company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
    ) VALUES (
      COALESCE(NEW.company_id, OLD.company_id),
      _assignment.employee_id,
      'employee',
      'shift_cancelled',
      '❌ Turno cancelado',
      _body,
      jsonb_build_object('shift_id', COALESCE(NEW.id, OLD.id), 'source', 'notify_employees_on_shift_change'),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Material changes: single notification route. Accepted assignees get the
-- re-acceptance flow (unchanged); pending assignees now get an informational
-- update (previously covered by the removed branches of the other trigger).
CREATE OR REPLACE FUNCTION public.handle_material_shift_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_material boolean := false;
  _assignment RECORD;
  _detail text := '';
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW; -- cancellation path owns this event
  END IF;

  IF OLD.date IS DISTINCT FROM NEW.date
     OR OLD.start_time IS DISTINCT FROM NEW.start_time
     OR OLD.end_time IS DISTINCT FROM NEW.end_time
     OR OLD.location_id IS DISTINCT FROM NEW.location_id
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.meeting_point IS DISTINCT FROM NEW.meeting_point
     OR OLD.notes IS DISTINCT FROM NEW.notes
     OR OLD.pay_type IS DISTINCT FROM NEW.pay_type
  THEN
    _is_material := true;
  END IF;

  IF NOT _is_material THEN
    RETURN NEW;
  END IF;

  NEW.operational_version := OLD.operational_version + 1;

  IF OLD.date IS DISTINCT FROM NEW.date THEN
    _detail := ' Nueva fecha: ' || to_char(NEW.date::date, 'DD Mon') || '.';
  END IF;
  IF OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.end_time IS DISTINCT FROM NEW.end_time THEN
    _detail := _detail || ' Nuevo horario: ' || substring(NEW.start_time::text from 1 for 5)
            || ' - ' || substring(NEW.end_time::text from 1 for 5) || '.';
  END IF;
  IF OLD.location_id IS DISTINCT FROM NEW.location_id THEN
    _detail := _detail || ' La ubicación fue actualizada.';
  END IF;

  FOR _assignment IN
    SELECT id, employee_id, response_status
    FROM shift_assignments
    WHERE shift_id = NEW.id
      AND status NOT IN ('rejected', 'removed')
      AND COALESCE(is_draft_reservation, false) = false
  LOOP
    IF _assignment.response_status = 'accepted' THEN
      UPDATE shift_assignments
      SET response_status = 'needs_reacceptance',
          response_required = true
      WHERE id = _assignment.id;

      INSERT INTO notifications (
        company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
      ) VALUES (
        NEW.company_id, _assignment.employee_id, 'employee',
        'shift_updated_reaccept',
        '🔄 Turno actualizado — acepta nuevamente',
        'Tu turno "' || NEW.title || '" del ' || to_char(NEW.date::date, 'DD Mon')
          || ' fue modificado.' || _detail || ' Debes aceptarlo o rechazarlo nuevamente.',
        jsonb_build_object(
          'shift_id', NEW.id, 'assignment_id', _assignment.id,
          'source', 'handle_material_shift_change',
          'old_date', OLD.date::text, 'new_date', NEW.date::text,
          'old_start', OLD.start_time::text, 'new_start', NEW.start_time::text,
          'old_end', OLD.end_time::text, 'new_end', NEW.end_time::text,
          'old_title', OLD.title, 'new_title', NEW.title
        ),
        NULL
      );
    ELSE
      INSERT INTO notifications (
        company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
      ) VALUES (
        NEW.company_id, _assignment.employee_id, 'employee',
        'shift_updated',
        '🔄 Turno actualizado',
        'El turno "' || NEW.title || '" del ' || to_char(NEW.date::date, 'DD Mon')
          || ' fue modificado.' || _detail,
        jsonb_build_object(
          'shift_id', NEW.id, 'assignment_id', _assignment.id,
          'source', 'handle_material_shift_change',
          'old_date', OLD.date::text, 'new_date', NEW.date::text,
          'old_start', OLD.start_time::text, 'new_start', NEW.start_time::text,
          'old_end', OLD.end_time::text, 'new_end', NEW.end_time::text
        ),
        NULL
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- F0.2  Assignment notification: single source (the INSERT trigger)
-- ============================================================
-- Keep trg_notify_on_shift_assignment as the ONLY producer, but widen its
-- guard to the same condition the RPC helper used (skip drafts) so no
-- coverage is lost when publication_status is not literally 'published'.
CREATE OR REPLACE FUNCTION public.notify_employee_on_shift_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _shift RECORD;
  _location_name text;
  _client_name text;
  _body text;
BEGIN
  IF COALESCE(NEW.is_draft_reservation, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  SELECT title, date, start_time, end_time, company_id, client_id, location_id,
         meeting_point, shift_code, publication_status, status, deleted_at
    INTO _shift
    FROM scheduled_shifts
   WHERE id = NEW.shift_id;

  IF NOT FOUND OR _shift.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF COALESCE(_shift.publication_status, 'draft') = 'draft'
     OR COALESCE(_shift.status, 'draft') = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _shift.location_id IS NOT NULL THEN
    SELECT name INTO _location_name FROM locations WHERE id = _shift.location_id;
  END IF;
  IF _shift.client_id IS NOT NULL THEN
    SELECT name INTO _client_name FROM clients WHERE id = _shift.client_id;
  END IF;

  _body := '"' || _shift.title || '"' ||
    CASE WHEN _shift.shift_code IS NOT NULL THEN ' (#' || lpad(_shift.shift_code::text, 4, '0') || ')' ELSE '' END ||
    ' — ' || to_char(_shift.date::date, 'DD Mon') ||
    ' de ' || substring(_shift.start_time::text from 1 for 5) ||
    ' a ' || substring(_shift.end_time::text from 1 for 5);

  IF _client_name IS NOT NULL THEN _body := _body || ' | ' || _client_name; END IF;
  IF _location_name IS NOT NULL THEN _body := _body || ' @ ' || _location_name; END IF;
  IF _shift.meeting_point IS NOT NULL AND _shift.meeting_point != '' THEN
    _body := _body || ' | Punto: ' || _shift.meeting_point;
  END IF;

  INSERT INTO notifications (
    company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
  ) VALUES (
    _shift.company_id, NEW.employee_id, 'employee',
    'shift_assigned', '📋 Nuevo turno asignado', _body,
    jsonb_build_object(
      'shift_id', NEW.shift_id, 'assignment_id', NEW.id,
      'source', 'notify_employee_on_shift_assignment',
      'action', 'review_shift_assignment',
      'date', _shift.date::text,
      'start_time', _shift.start_time::text,
      'end_time', _shift.end_time::text,
      'client', COALESCE(_client_name, ''),
      'location', COALESCE(_location_name, '')
    ),
    NULL
  );

  RETURN NEW;
END;
$function$;

-- RPC no longer emits its own notification (the INSERT trigger does).
-- Audit trail is preserved and now records the notification source.
CREATE OR REPLACE FUNCTION public.assign_worker_to_shift(
  p_shift_id uuid,
  p_employee_id uuid,
  p_assignment_role text DEFAULT 'worker'::text,
  p_reason text DEFAULT NULL::text,
  p_source text DEFAULT 'mobile_manage_team'::text
)
RETURNS shift_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_shift           public.scheduled_shifts;
  v_emp_company_id  uuid;
  v_is_active       boolean;
  v_existing        public.shift_assignments;
  v_assignment      public.shift_assignments;
  v_status          jsonb;
  v_readiness       text;
  v_compliance      text;
  v_has_override    boolean;
  v_audit_reason    text := p_reason;
  v_notification_id uuid;
BEGIN
  IF p_shift_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_shift FROM public.scheduled_shifts
    WHERE id = p_shift_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_shift_company(v_shift.company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT company_id, COALESCE(is_active, true)
    INTO v_emp_company_id, v_is_active
    FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp_company_id IS DISTINCT FROM v_shift.company_id THEN
    RAISE EXCEPTION 'employee_wrong_company' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_active THEN
    RAISE EXCEPTION 'employee_inactive' USING ERRCODE = '22023';
  END IF;

  -- Single source of truth: get_employee_assignment_status (unchanged, P0.1)
  v_status       := public.get_employee_assignment_status(p_employee_id, v_shift.company_id);
  v_readiness    := v_status->>'readiness';
  v_compliance   := v_status->>'compliance_status';
  v_has_override := public.has_active_assignment_override(p_shift_id, p_employee_id);

  IF NOT v_has_override THEN
    IF (v_status->>'requires_override')::boolean THEN
      RAISE EXCEPTION 'compliance_override_required:%', v_compliance USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE((v_status->>'can_assign')::boolean, false) THEN
      RAISE EXCEPTION 'compliance_blocked:%', v_compliance USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_has_override THEN
    v_audit_reason := COALESCE(v_audit_reason || ' | ', '') || '[admin_override active]';
  ELSIF v_compliance IS DISTINCT FROM 'clear' THEN
    v_audit_reason := COALESCE(v_audit_reason || ' | ', '') || '[compliance_warning: ' || v_compliance || ']';
  END IF;

  SELECT * INTO v_existing
    FROM public.shift_assignments
    WHERE shift_id = p_shift_id AND employee_id = p_employee_id
      AND status NOT IN ('rejected', 'removed')
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'already_assigned:%', v_existing.id USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.shift_assignments (
    company_id, shift_id, employee_id,
    status, response_status, assignment_role,
    response_required, is_draft_reservation
  ) VALUES (
    v_shift.company_id, p_shift_id, p_employee_id,
    'pending', 'pending', COALESCE(NULLIF(p_assignment_role, ''), 'worker'),
    true, false
  ) RETURNING * INTO v_assignment;

  -- F0: notification is produced exclusively by trg_notify_on_shift_assignment.
  SELECT id INTO v_notification_id
    FROM public.notifications
   WHERE recipient_id = p_employee_id
     AND type = 'shift_assigned'
     AND metadata->>'assignment_id' = v_assignment.id::text
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.shift_audit_log(
    company_id, shift_id, assignment_id, employee_id, actor_user_id,
    action, before_data, after_data, reason, source
  ) VALUES (
    v_shift.company_id, p_shift_id, v_assignment.id, p_employee_id, auth.uid(),
    'assignment_created', NULL,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'status', v_assignment.status,
      'response_status', v_assignment.response_status,
      'assignment_role', v_assignment.assignment_role,
      'readiness', v_readiness,
      'compliance_status', v_compliance,
      'policy', v_status->>'policy',
      'admin_override', v_has_override,
      'notification_id', v_notification_id,
      'notification_sent', v_notification_id IS NOT NULL,
      'notification_source', 'trg_notify_on_shift_assignment'
    ),
    v_audit_reason,
    COALESCE(NULLIF(p_source, ''), 'mobile_manage_team')
  );

  RETURN v_assignment;
END;
$function$;

-- ============================================================
-- F0.3  Shift chat access: tenant-scoped + active assignment only
-- ============================================================
-- BEFORE (scm_select USING):
--   user_is_company_admin(auth.uid(), company_id) OR user_is_assigned_to_shift(auth.uid(), shift_id)
--   -> user_is_company_admin() includes a GLOBAL has_role(uid,'admin') check,
--      so any global-admin could read every tenant's shift chats.
--   -> user_is_assigned_to_shift() ignores company_id and draft reservations.
CREATE OR REPLACE FUNCTION public.can_read_shift_chat(_user_id uuid, _company_id uuid, _shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.scheduled_shifts s
        WHERE s.id = _shift_id AND s.company_id = _company_id
     )
     AND (
       public.is_global_owner(_user_id)
       OR public.is_company_owner(_user_id, _company_id)
       OR public.has_company_role(_user_id, _company_id, 'admin')
       OR public.has_company_role(_user_id, _company_id, 'manager')
       OR EXISTS (
         SELECT 1
           FROM public.shift_assignments sa
           JOIN public.employees e ON e.id = sa.employee_id
          WHERE sa.shift_id = _shift_id
            AND sa.company_id = _company_id
            AND e.user_id = _user_id
            AND sa.status NOT IN ('rejected', 'removed')
            AND COALESCE(sa.is_draft_reservation, false) = false
       )
     )
$function$;

DROP POLICY IF EXISTS scm_select ON public.shift_chat_messages;
CREATE POLICY scm_select ON public.shift_chat_messages
FOR SELECT TO authenticated
USING (public.can_read_shift_chat(auth.uid(), company_id, shift_id));

DROP POLICY IF EXISTS scm_insert_admin ON public.shift_chat_messages;
CREATE POLICY scm_insert_admin ON public.shift_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'admin'
  AND sender_user_id = auth.uid()
  AND (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_company_role(auth.uid(), company_id, 'admin')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  )
  AND EXISTS (SELECT 1 FROM public.scheduled_shifts s WHERE s.id = shift_id AND s.company_id = company_id)
);

DROP POLICY IF EXISTS scm_insert_employee ON public.shift_chat_messages;
CREATE POLICY scm_insert_employee ON public.shift_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'employee'
  AND sender_employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid())
  AND public.can_read_shift_chat(auth.uid(), company_id, shift_id)
);