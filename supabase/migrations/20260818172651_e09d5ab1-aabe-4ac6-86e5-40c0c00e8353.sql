CREATE OR REPLACE FUNCTION public.service_publish_readiness(_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shift public.scheduled_shifts%ROWTYPE;
  _actor uuid := auth.uid();
  _cfg jsonb;
  _req_client boolean;
  _req_location boolean;
  _req_shift_admin boolean;
  _max_hours numeric;
  _blockers jsonb := '[]'::jsonb;
  _warnings jsonb := '[]'::jsonb;
  _assigned int := 0;
  _required int := 0;
  _claimable boolean := false;
  _mode text;
  _has_job_site boolean := false;
  _saved_job_site boolean := false;
  _has_meeting boolean := false;
  _duration_min numeric;
  _terminal boolean := false;
BEGIN
  SELECT * INTO _shift FROM public.scheduled_shifts WHERE id = _shift_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'terminal', true,
      'blockers', jsonb_build_array('not_found'), 'warnings', '[]'::jsonb);
  END IF;

  IF _shift.company_id IS NULL THEN
    _blockers := _blockers || '"company"'::jsonb;
  END IF;

  IF _actor IS NULL
     OR (_shift.company_id IS NOT NULL
         AND NOT public.has_permission(_actor, _shift.company_id, 'service.publish')) THEN
    _blockers := _blockers || '"permission"'::jsonb;
  END IF;

  SELECT cs.value INTO _cfg
    FROM public.company_settings cs
   WHERE cs.company_id = _shift.company_id AND cs.key = 'shifts_config';

  _req_client      := COALESCE((_cfg->>'require_client')::boolean, false);
  _req_location    := COALESCE((_cfg->>'require_location')::boolean, false);
  _req_shift_admin := COALESCE((_cfg->>'require_shift_admin')::boolean, false);
  _max_hours       := COALESCE((_cfg->>'max_shift_hours')::numeric, 16);

  _terminal := (_shift.status = 'cancelled'
                OR _shift.publication_status IN ('cancelled', 'archived')
                OR _shift.deleted_at IS NOT NULL);

  _required := COALESCE(_shift.slots, 0);
  _claimable := COALESCE(_shift.claimable, false);
  _mode := CASE WHEN _claimable THEN 'claim' ELSE 'direct' END;

  SELECT count(*) INTO _assigned
    FROM public.shift_assignments sa
   WHERE sa.shift_id = _shift_id
     AND COALESCE(sa.status, '') NOT IN ('cancelled','canceled','removed','unassigned','replaced','rejected','declined')
     AND sa.removed_at IS NULL;

  IF _terminal THEN
    RETURN jsonb_build_object(
      'ok', false, 'terminal', true,
      'blockers', _blockers || '"cancelled"'::jsonb,
      'warnings', '[]'::jsonb,
      'mode', _mode,
      'coverage', jsonb_build_object('required', _required, 'assigned', _assigned,
                                     'open', GREATEST(0, _required - _assigned)),
      'company_requirements', jsonb_build_object(
        'require_client', _req_client, 'require_location', _req_location,
        'require_shift_admin', _req_shift_admin, 'max_shift_hours', _max_hours)
    );
  END IF;

  -- HARD INVARIANTS
  IF _shift."date" IS NULL THEN _blockers := _blockers || '"date"'::jsonb; END IF;
  IF _shift.start_time IS NULL THEN _blockers := _blockers || '"start_time"'::jsonb; END IF;
  IF _shift.end_time IS NULL THEN _blockers := _blockers || '"end_time"'::jsonb; END IF;

  -- STAFFING MODE
  IF _claimable THEN
    IF _required <= 0 THEN _blockers := _blockers || '"capacity"'::jsonb; END IF;
  ELSE
    IF _assigned = 0 THEN _blockers := _blockers || '"assignments"'::jsonb; END IF;
  END IF;

  -- LOCATION (job site): saved venue (legacy), job site v2, or free-text address.
  _saved_job_site := (_shift.location_id IS NOT NULL OR _shift.job_site_location_id IS NOT NULL);
  _has_job_site := _saved_job_site OR COALESCE(btrim(_shift.job_site_address), '') <> '';
  _has_meeting := (_shift.meeting_point_location_id IS NOT NULL
                   OR COALESCE(btrim(_shift.meeting_point), '') <> '');

  IF _req_location AND NOT _has_job_site THEN
    _blockers := _blockers || '"job_site"'::jsonb;
  END IF;

  IF _req_client AND _shift.client_id IS NULL THEN
    _blockers := _blockers || '"client"'::jsonb;
  END IF;

  IF _req_shift_admin AND _shift.shift_admin_id IS NULL THEN
    _blockers := _blockers || '"shift_admin"'::jsonb;
  END IF;

  IF COALESCE(_shift.transportation_required, false) AND _shift.driver_employee_id IS NULL THEN
    _blockers := _blockers || '"driver"'::jsonb;
  END IF;

  IF _shift.start_time IS NOT NULL AND _shift.end_time IS NOT NULL THEN
    _duration_min := EXTRACT(EPOCH FROM (_shift.end_time - _shift.start_time)) / 60;
    IF _duration_min < 0 THEN _duration_min := _duration_min + 1440; END IF;
    IF _duration_min = 0 OR (_duration_min / 60) > _max_hours THEN
      _blockers := _blockers || '"duration"'::jsonb;
    END IF;
  END IF;

  -- WARNINGS (non blocking)
  IF _has_job_site AND NOT _saved_job_site THEN
    _warnings := _warnings || '"job_site_unsaved"'::jsonb;
  END IF;
  IF COALESCE(_shift.transportation_required, false) AND NOT _has_meeting THEN
    _warnings := _warnings || '"meeting_missing"'::jsonb;
  END IF;
  IF _claimable AND _assigned = 0 THEN
    _warnings := _warnings || '"team_pending"'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(_blockers) = 0,
    'terminal', false,
    'blockers', _blockers,
    'warnings', _warnings,
    'mode', _mode,
    'coverage', jsonb_build_object('required', _required, 'assigned', _assigned,
                                   'open', GREATEST(0, _required - _assigned)),
    'company_requirements', jsonb_build_object(
      'require_client', _req_client, 'require_location', _req_location,
      'require_shift_admin', _req_shift_admin, 'max_shift_hours', _max_hours)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_publish_readiness(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.service_publish_readiness(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_shift_draft(_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shift public.scheduled_shifts%ROWTYPE;
  _actor uuid := auth.uid();
  _readiness jsonb;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _shift FROM public.scheduled_shifts WHERE id = _shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(_actor, _shift.company_id, 'service.publish') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- PHASE 2 · SSOT: readiness is decided by service_publish_readiness only.
  _readiness := public.service_publish_readiness(_shift_id);

  IF COALESCE((_readiness->>'terminal')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'terminal', true,
      'missing', _readiness->'blockers', 'readiness', _readiness);
  END IF;

  IF _shift.publication_status = 'published' THEN
    IF _shift.status = 'draft' THEN
      UPDATE public.scheduled_shifts SET status = 'published', updated_at = now() WHERE id = _shift_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'already_published', true, 'readiness', _readiness);
  END IF;

  IF NOT COALESCE((_readiness->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'missing', _readiness->'blockers',
      'staffing_mode', _readiness->>'mode',
      'assigned_count', (_readiness#>>'{coverage,assigned}')::int,
      'required_count', (_readiness#>>'{coverage,required}')::int,
      'readiness', _readiness
    );
  END IF;

  UPDATE public.scheduled_shifts
     SET publication_status = 'published',
         status = CASE WHEN status = 'draft' THEN 'published' ELSE status END,
         published_at = now(),
         published_by = _actor,
         updated_at = now()
   WHERE id = _shift_id;

  RETURN jsonb_build_object(
    'ok', true,
    'published', true,
    'staffing_mode', _readiness->>'mode',
    'assigned_count', (_readiness#>>'{coverage,assigned}')::int,
    'required_count', (_readiness#>>'{coverage,required}')::int,
    'open_slots', (_readiness#>>'{coverage,open}')::int,
    'readiness', _readiness
  );
END;
$$;