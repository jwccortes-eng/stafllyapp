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
  _assigned_count int := 0;
  _required int := 0;
  _claimable boolean := false;
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

  -- Phase 1 · CANCELLED IS TERMINAL. A cancelled/archived/soft-deleted service
  -- can never be published, no matter what publication_status says. Historic
  -- rows are left untouched: this is a functional guard, not a migration.
  IF _shift.status = 'cancelled'
     OR _shift.publication_status IN ('cancelled', 'archived')
     OR _shift.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'missing', to_jsonb(ARRAY['cancelled']::text[]), 'terminal', true);
  END IF;

  IF _shift.publication_status = 'published' THEN
    IF _shift.status = 'draft' THEN
      UPDATE public.scheduled_shifts SET status = 'published', updated_at = now() WHERE id = _shift_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'already_published', true);
  END IF;

  -- Canonical date column on scheduled_shifts is "date" (not shift_date).
  IF _shift."date" IS NULL THEN _missing := array_append(_missing, 'date'); END IF;
  IF _shift.start_time IS NULL THEN _missing := array_append(_missing, 'start_time'); END IF;
  IF _shift.end_time IS NULL THEN _missing := array_append(_missing, 'end_time'); END IF;

  _required := COALESCE(_shift.slots, 0);
  _claimable := COALESCE(_shift.claimable, false);

  -- Active assignments only: cancelled/removed/rejected never count as coverage
  -- (same vocabulary as the canonical staffing metrics on the client).
  SELECT count(*) INTO _assigned_count
    FROM public.shift_assignments sa
   WHERE sa.shift_id = _shift_id
     AND COALESCE(sa.status, '') NOT IN ('cancelled', 'canceled', 'removed', 'unassigned', 'replaced', 'rejected', 'declined')
     AND sa.removed_at IS NULL;

  IF _claimable THEN
    -- CLAIM / OPEN STAFFING: publishing with 0/Y is the whole point of the
    -- model (workers claim open slots). Only real capacity is required.
    IF _required <= 0 THEN _missing := array_append(_missing, 'capacity'); END IF;
  ELSE
    -- DIRECT STAFFING: unchanged protection.
    IF _assigned_count = 0 THEN _missing := array_append(_missing, 'assignments'); END IF;
  END IF;

  IF array_length(_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'missing', to_jsonb(_missing),
      'staffing_mode', CASE WHEN _claimable THEN 'claim' ELSE 'direct' END,
      'assigned_count', _assigned_count,
      'required_count', _required
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
    'staffing_mode', CASE WHEN _claimable THEN 'claim' ELSE 'direct' END,
    'assigned_count', _assigned_count,
    'required_count', _required,
    'open_slots', GREATEST(0, _required - _assigned_count)
  );
END;
$function$;