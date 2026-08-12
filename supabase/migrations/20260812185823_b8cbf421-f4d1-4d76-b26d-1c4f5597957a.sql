
INSERT INTO public.company_internal_id_counters (company_id, last_number)
VALUES ('37f92f75-7af4-4496-aa10-793e14b09ed9', 1000)
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO public.company_settings (company_id, key, value)
SELECT '37f92f75-7af4-4496-aa10-793e14b09ed9', cs.key, cs.value
FROM public.company_settings cs
WHERE cs.company_id = '00000000-0000-0000-0000-000000000001'
  AND cs.key IN ('shifts_config','onboarding_config')
  AND NOT EXISTS (
    SELECT 1 FROM public.company_settings x
    WHERE x.company_id = '37f92f75-7af4-4496-aa10-793e14b09ed9' AND x.key = cs.key
  );

UPDATE public.company_settings
SET value = jsonb_build_object('padding', 0, 'prefix', '', 'start_number', 1001)
WHERE company_id = '37f92f75-7af4-4496-aa10-793e14b09ed9'
  AND key = 'employee_number_config';
