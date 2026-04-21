DO $$
DECLARE
  v_inserted INT := 0;
  v_skipped_no_coords INT := 0;
  v_shifts_linked INT := 0;
BEGIN
  WITH inserted AS (
    INSERT INTO public.locations_v2 (
      company_id, location_type, name, formatted_address, city, state,
      latitude, longitude, geofence_radius_meters, is_active, metadata
    )
    SELECT
      l.company_id,
      'job_site'::location_type_enum,
      COALESCE(NULLIF(trim(l.name), ''), 'Job site'),
      l.address, l.city, l.state,
      COALESCE(l.latitude, l.geofence_lat::double precision),
      COALESCE(l.longitude, l.geofence_lng::double precision),
      COALESCE(l.geofence_radius, 200),
      COALESCE(l.status = 'active', true),
      jsonb_build_object(
        'legacy_location_id', l.id::text,
        'migrated_at', now(),
        'migration', 'phase_2c_backfill'
      )
    FROM public.locations l
    WHERE l.deleted_at IS NULL
      AND (l.latitude IS NOT NULL OR l.geofence_lat IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.locations_v2 lv2
        WHERE lv2.company_id = l.company_id
          AND lv2.metadata->>'legacy_location_id' = l.id::text
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  SELECT COUNT(*) INTO v_skipped_no_coords
  FROM public.locations l
  WHERE l.deleted_at IS NULL
    AND l.latitude IS NULL
    AND l.geofence_lat IS NULL;

  WITH map AS (
    SELECT lv2.id AS v2_id, (lv2.metadata->>'legacy_location_id')::uuid AS legacy_id, lv2.company_id
    FROM public.locations_v2 lv2
    WHERE lv2.metadata->>'migration' = 'phase_2c_backfill'
  ),
  updated AS (
    UPDATE public.scheduled_shifts s
       SET job_site_location_id = m.v2_id
      FROM map m
     WHERE s.location_id = m.legacy_id
       AND s.company_id = m.company_id
       AND s.job_site_location_id IS NULL
       AND s.deleted_at IS NULL
       AND s.date >= CURRENT_DATE - 30
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_shifts_linked FROM updated;

  INSERT INTO public.automation_log (company_id, rule_key, status, details)
  SELECT c.id, 'phase_2c_location_backfill', 'completed',
    jsonb_build_object(
      'inserted_locations_v2', v_inserted,
      'skipped_no_coords', v_skipped_no_coords,
      'shifts_linked', v_shifts_linked,
      'ran_at', now()
    )
  FROM public.companies c
  WHERE EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = c.id AND l.deleted_at IS NULL)
  LIMIT 1;

  RAISE NOTICE 'Phase 2C: % migrated, % skipped, % shifts linked',
    v_inserted, v_skipped_no_coords, v_shifts_linked;
END $$;