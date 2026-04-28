-- =====================================================================
-- SHIFT DRAFTS — Phase 1: Schema + Backfill + Guardrails
-- =====================================================================

-- 1) Publication status enum
DO $$ BEGIN
  CREATE TYPE public.shift_publication_status AS ENUM ('draft', 'published', 'cancelled', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Add column to scheduled_shifts. Default 'published' so legacy rows
--    keep behavior intact. New inserts from the form decide explicitly.
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS publication_status public.shift_publication_status NOT NULL DEFAULT 'published';

ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS published_by uuid NULL;

-- 3) Backfill: every existing row is treated as published.
UPDATE public.scheduled_shifts
   SET publication_status = 'published',
       published_at = COALESCE(published_at, created_at)
 WHERE publication_status IS NULL OR publication_status = 'draft';

-- 4) Index for fast filtering of drafts per company.
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_company_pubstatus
  ON public.scheduled_shifts (company_id, publication_status)
  WHERE deleted_at IS NULL;

-- 5) Tentative reservation flag on assignments.
--    Drafts can pre-assign workers without notifying them.
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS is_draft_reservation boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_draft_reservation
  ON public.shift_assignments (shift_id) WHERE is_draft_reservation = true;

-- 6) Notification trigger guard — block on drafts.
--    Replaces notify_employee_on_shift_assignment with an early-return
--    when the parent shift is a draft OR the assignment itself is a
--    draft reservation. Keeps original logic for everything else.
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
  -- HARD GUARD: no notifications for draft reservations.
  IF COALESCE(NEW.is_draft_reservation, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  SELECT title, date, start_time, end_time, company_id, client_id, location_id, meeting_point, shift_code, publication_status
    INTO _shift
    FROM scheduled_shifts
   WHERE id = NEW.shift_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- HARD GUARD: shift must be published to notify.
  IF _shift.publication_status IS DISTINCT FROM 'published' THEN
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

  IF _client_name IS NOT NULL THEN
    _body := _body || ' | ' || _client_name;
  END IF;
  IF _location_name IS NOT NULL THEN
    _body := _body || ' @ ' || _location_name;
  END IF;
  IF _shift.meeting_point IS NOT NULL AND _shift.meeting_point != '' THEN
    _body := _body || ' | Punto: ' || _shift.meeting_point;
  END IF;

  INSERT INTO notifications (
    company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
  ) VALUES (
    _shift.company_id,
    NEW.employee_id,
    'employee',
    'shift_assigned',
    '📋 Nuevo turno asignado',
    _body,
    jsonb_build_object(
      'shift_id', NEW.shift_id,
      'assignment_id', NEW.id,
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

-- 7) Soften the readiness gate for draft reservations.
--    A draft reservation is a planning artifact, not a commitment.
CREATE OR REPLACE FUNCTION public.enforce_employee_ready_for_shift()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile_status public.employee_profile_status;
  _onboarding_status text;
  _employee_name text;
  _is_active boolean;
  _emp_company_id uuid;
  _shift_company_id uuid;
  _shift_pub_status public.shift_publication_status;
  _has_override boolean;
  _new_status text := COALESCE(NEW.status, 'pending');
BEGIN
  IF _new_status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  -- Draft reservation bypass: planning only, no readiness enforcement.
  IF COALESCE(NEW.is_draft_reservation, false) THEN
    -- Still verify the employee exists and belongs to the same company.
    SELECT e.company_id, COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')
      INTO _emp_company_id, _employee_name
      FROM public.employees e WHERE e.id = NEW.employee_id;
    IF _emp_company_id IS NULL THEN
      RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND: employee % does not exist', NEW.employee_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    SELECT company_id INTO _shift_company_id FROM public.scheduled_shifts WHERE id = NEW.shift_id;
    IF _shift_company_id IS NOT NULL AND _shift_company_id IS DISTINCT FROM _emp_company_id THEN
      RAISE EXCEPTION 'EMPLOYEE_WRONG_COMPANY: % no pertenece a esta compañía.', _employee_name
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT e.profile_status, e.onboarding_status,
         COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, ''),
         COALESCE(e.is_active, true), e.company_id
    INTO _profile_status, _onboarding_status, _employee_name, _is_active, _emp_company_id
    FROM public.employees e
   WHERE e.id = NEW.employee_id;

  IF _emp_company_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND: employee % does not exist', NEW.employee_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT _is_active THEN
    RAISE EXCEPTION 'EMPLOYEE_INACTIVE: % está archivado/inactivo y no puede ser asignado a turnos.', _employee_name
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT company_id, publication_status INTO _shift_company_id, _shift_pub_status
    FROM public.scheduled_shifts WHERE id = NEW.shift_id;
  IF _shift_company_id IS NOT NULL AND _shift_company_id IS DISTINCT FROM _emp_company_id THEN
    RAISE EXCEPTION 'EMPLOYEE_WRONG_COMPANY: % no pertenece a esta compañía.', _employee_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- If parent shift is a draft, treat assignment as planning only.
  IF _shift_pub_status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _new_status IN ('pending', 'review') THEN
    RETURN NEW;
  END IF;

  _has_override := public.has_active_assignment_override(NEW.shift_id, NEW.employee_id);
  IF _has_override THEN
    BEGIN
      NEW.notes := COALESCE(NEW.notes, '') ||
        CASE WHEN NEW.notes IS NULL OR NEW.notes = '' THEN '' ELSE ' | ' END ||
        '[admin_override active]';
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    RETURN NEW;
  END IF;

  IF _profile_status IS DISTINCT FROM 'ready'::public.employee_profile_status
     AND _profile_status IS DISTINCT FROM 'active'::public.employee_profile_status THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_READY: % no puede confirmar turnos hasta completar perfil. Estado: %, onboarding: %',
      _employee_name, _profile_status, _onboarding_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- 8) Portal RLS: hide drafts from workers.
--    Replace the existing SELECT policy that exposed shifts to assigned employees.
DROP POLICY IF EXISTS "Employees can view assigned shifts" ON public.scheduled_shifts;
CREATE POLICY "Employees can view assigned shifts"
ON public.scheduled_shifts
FOR SELECT
USING (
  publication_status = 'published'
  AND (
    EXISTS (
      SELECT 1
        FROM shift_assignments sa
        JOIN employees e ON e.id = sa.employee_id
       WHERE sa.shift_id = scheduled_shifts.id
         AND e.user_id = auth.uid()
         AND sa.status NOT IN ('removed','rejected')
         AND COALESCE(sa.is_draft_reservation, false) = false
    )
    OR (
      claimable = true
      AND status IN ('open','published')
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM employees
         WHERE employees.user_id = auth.uid()
           AND employees.company_id = scheduled_shifts.company_id
           AND employees.is_active = true
      )
    )
  )
);

-- 9) Helper: publish a draft atomically with validation.
CREATE OR REPLACE FUNCTION public.publish_shift_draft(_shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _shift public.scheduled_shifts%ROWTYPE;
  _actor uuid := auth.uid();
  _missing text[] := ARRAY[]::text[];
  _assigned_count int;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _shift FROM public.scheduled_shifts WHERE id = _shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.user_is_company_admin(_actor, _shift.company_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _shift.publication_status = 'published' THEN
    RETURN jsonb_build_object('ok', true, 'already_published', true);
  END IF;

  -- Minimum validations (frontend already validates richer rules).
  IF _shift.date IS NULL THEN _missing := _missing || 'date'; END IF;
  IF _shift.start_time IS NULL THEN _missing := _missing || 'start_time'; END IF;
  IF _shift.end_time IS NULL THEN _missing := _missing || 'end_time'; END IF;
  IF _shift.title IS NULL OR length(trim(_shift.title)) = 0 THEN _missing := _missing || 'title'; END IF;

  SELECT COUNT(*) INTO _assigned_count FROM public.shift_assignments
   WHERE shift_id = _shift_id AND status NOT IN ('removed','rejected');
  IF _assigned_count = 0 AND COALESCE(_shift.claimable, false) = false THEN
    _missing := _missing || 'workers_or_claimable';
  END IF;

  IF array_length(_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PUBLISH_VALIDATION_FAILED: %', array_to_string(_missing, ',')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Promote the shift and lift draft reservation flags so notifications fire.
  UPDATE public.scheduled_shifts
     SET publication_status = 'published',
         published_at = now(),
         published_by = _actor,
         updated_at = now()
   WHERE id = _shift_id;

  UPDATE public.shift_assignments
     SET is_draft_reservation = false
   WHERE shift_id = _shift_id AND is_draft_reservation = true;

  RETURN jsonb_build_object('ok', true, 'shift_id', _shift_id, 'published_at', now());
END;
$function$;