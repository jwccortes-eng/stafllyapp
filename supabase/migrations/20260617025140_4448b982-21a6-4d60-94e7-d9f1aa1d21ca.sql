-- P1 worker_consent_records tenant + audit-safe hardening (pre-Phase 3)
-- Splits wcr_owner_all into SELECT/INSERT/UPDATE; DELETE not granted (default-deny).

DROP POLICY IF EXISTS wcr_owner_all ON public.worker_consent_records;

CREATE POLICY wcr_owner_select
ON public.worker_consent_records
FOR SELECT
TO authenticated
USING (
  worker_profile_id IN (
    SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY wcr_owner_insert
ON public.worker_consent_records
FOR INSERT
TO authenticated
WITH CHECK (
  worker_profile_id IN (
    SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY wcr_owner_update
ON public.worker_consent_records
FOR UPDATE
TO authenticated
USING (
  worker_profile_id IN (
    SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  worker_profile_id IN (
    SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()
  )
);

-- NO DELETE policy — blocked by default to preserve consent audit trail.
-- wcr_admin_read remains untouched (global owner/developer read).
-- Rollback:
--   DROP POLICY wcr_owner_select ON public.worker_consent_records;
--   DROP POLICY wcr_owner_insert ON public.worker_consent_records;
--   DROP POLICY wcr_owner_update ON public.worker_consent_records;
--   CREATE POLICY wcr_owner_all ON public.worker_consent_records
--     FOR ALL TO authenticated
--     USING (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()))
--     WITH CHECK (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()));
