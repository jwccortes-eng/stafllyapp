DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_start jsonb;
  v_bad jsonb;
  v_ok jsonb;
BEGIN
  v_start := public.internal_start_pin_recovery(v_uid, 't•••t@e•••.com', NULL, 'worker', v_uid, 'email');
  RAISE NOTICE 'start ok=%', v_start->>'ok';
  v_bad := public.internal_verify_pin_recovery((v_start->>'request_id')::uuid, '000000');
  RAISE NOTICE 'bad verify: %', v_bad;
  v_ok := public.internal_verify_pin_recovery((v_start->>'request_id')::uuid, v_start->>'code');
  RAISE NOTICE 'good verify ok=%', v_ok->>'ok';
  RAISE NOTICE 'replay start (cooldown): %', public.internal_start_pin_recovery(v_uid, 'x', NULL, 'worker', v_uid, 'email');
  DELETE FROM public.auth_recovery_requests WHERE user_id = v_uid;
  DELETE FROM public.activity_log WHERE entity_id = v_uid::text;
END $$;