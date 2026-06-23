-- Sprint S7-L-b: Flip Stafly Demo to hash_only_ready (setting flip only).
-- Owner approval: Jorge (Stafly Demo only). On-call: Jorge. Monitoring: 24h.
-- Scope: ONE row in company_settings. Demo tenant only.

DO $$
DECLARE
  v_demo_id constant uuid := 'd3500000-0000-4000-8000-000000000001';
  v_is_demo boolean;
  v_before jsonb;
  v_after  jsonb;
BEGIN
  -- Guardrail 1: target must exist and be flagged as demo.
  SELECT is_demo INTO v_is_demo
  FROM public.companies
  WHERE id = v_demo_id;

  IF v_is_demo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'S7-L-b ABORT: target company % is not flagged is_demo=true', v_demo_id;
  END IF;

  -- Guardrail 2: no real tenant may currently hold hash_only_ready or hash_only.
  IF EXISTS (
    SELECT 1
    FROM public.company_settings cs
    JOIN public.companies c ON c.id = cs.company_id
    WHERE cs.key = 'security.pin_auth_mode'
      AND cs.value::text IN ('"hash_only_ready"', '"hash_only"')
      AND COALESCE(c.is_demo, false) = false
      AND COALESCE(c.is_test, false) = false
  ) THEN
    RAISE EXCEPTION 'S7-L-b ABORT: a non-demo/non-test tenant already holds hash_only_ready/hash_only';
  END IF;

  -- Capture before-state for audit.
  SELECT value INTO v_before
  FROM public.company_settings
  WHERE company_id = v_demo_id AND key = 'security.pin_auth_mode';

  -- Single allowed write.
  INSERT INTO public.company_settings (company_id, key, value)
  VALUES (v_demo_id, 'security.pin_auth_mode', '"hash_only_ready"'::jsonb)
  ON CONFLICT (company_id, key)
  DO UPDATE SET value = EXCLUDED.value,
                updated_at = now();

  SELECT value INTO v_after
  FROM public.company_settings
  WHERE company_id = v_demo_id AND key = 'security.pin_auth_mode';

  RAISE NOTICE 'S7-L-b OK: Stafly Demo security.pin_auth_mode % -> %',
    COALESCE(v_before::text, 'NULL'), v_after::text;
END $$;

-- Post-flip invariants.
DO $$
DECLARE
  v_demo_mode text;
  v_real_count int;
BEGIN
  SELECT value::text INTO v_demo_mode
  FROM public.company_settings
  WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
    AND key = 'security.pin_auth_mode';

  IF v_demo_mode <> '"hash_only_ready"' THEN
    RAISE EXCEPTION 'S7-L-b POSTCHECK FAIL: demo mode = %', v_demo_mode;
  END IF;

  SELECT count(*) INTO v_real_count
  FROM public.company_settings cs
  JOIN public.companies c ON c.id = cs.company_id
  WHERE cs.key = 'security.pin_auth_mode'
    AND cs.value::text IN ('"hash_only_ready"', '"hash_only"')
    AND COALESCE(c.is_demo, false) = false
    AND COALESCE(c.is_test, false) = false;

  IF v_real_count <> 0 THEN
    RAISE EXCEPTION 'S7-L-b POSTCHECK FAIL: % real tenant(s) in hash_only_ready/hash_only', v_real_count;
  END IF;
END $$;