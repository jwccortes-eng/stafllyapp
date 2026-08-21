CREATE OR REPLACE FUNCTION public.publish_shift_draft(_shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _shift public.scheduled_shifts%ROWTYPE;
  _actor uuid := auth.uid();
  _readiness jsonb;
  _released int := 0;
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

    -- Idempotent repair: release tentative reservations left behind.
    UPDATE public.shift_assignments
       SET is_draft_reservation = false,
           updated_at = now()
     WHERE shift_id = _shift_id
       AND is_draft_reservation = true
       AND COALESCE(status, '') NOT IN ('removed', 'rejected', 'cancelled');
    GET DIAGNOSTICS _released = ROW_COUNT;

    RETURN jsonb_build_object('ok', true, 'already_published', true,
      'released_reservations', _released, 'readiness', _readiness);
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

  -- Tentative reservations become real assignments in the same transaction.
  UPDATE public.shift_assignments
     SET is_draft_reservation = false,
         updated_at = now()
   WHERE shift_id = _shift_id
     AND is_draft_reservation = true
     AND COALESCE(status, '') NOT IN ('removed', 'rejected', 'cancelled');
  GET DIAGNOSTICS _released = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'published', true,
    'released_reservations', _released,
    'staffing_mode', _readiness->>'mode',
    'assigned_count', (_readiness#>>'{coverage,assigned}')::int,
    'required_count', (_readiness#>>'{coverage,required}')::int,
    'open_slots', (_readiness#>>'{coverage,open}')::int,
    'readiness', _readiness
  );
END;
$function$;