
-- 1. Relax NOT NULL on company_id for pool-global referrals
ALTER TABLE public.job_applications ALTER COLUMN company_id DROP NOT NULL;

-- 2. Add referral tracking columns
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS source_partner_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_text_version text,
  ADD COLUMN IF NOT EXISTS intake_kind text NOT NULL DEFAULT 'self_apply',
  ADD COLUMN IF NOT EXISTS routed_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- 3. Per-column SELECT grants so PostgREST can read new columns (column-whitelist model from Phase 1.5)
GRANT SELECT (referral_source, source_partner_company_id, submitted_by_user_id, opportunity_id,
              preferred_contact_method, consent_at, consent_text_version, intake_kind, routed_company_id)
  ON public.job_applications TO authenticated, anon;

-- 4. Constraints
DO $$ BEGIN
  ALTER TABLE public.job_applications
    ADD CONSTRAINT job_applications_intake_kind_chk
    CHECK (intake_kind IN ('self_apply','partner_referral','client_referral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.job_applications
    ADD CONSTRAINT job_applications_contact_method_chk
    CHECK (preferred_contact_method IS NULL OR preferred_contact_method IN ('phone','whatsapp','email','sms'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Partial index for fast global-pool inbox lookups
CREATE INDEX IF NOT EXISTS idx_job_applications_pool_status
  ON public.job_applications (status, created_at DESC)
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_applications_submitted_by
  ON public.job_applications (submitted_by_user_id)
  WHERE submitted_by_user_id IS NOT NULL;

-- 6. New RLS policies (additive; existing 3 policies untouched)
-- Authenticated partners/clients can INSERT referrals into the global pool
CREATE POLICY "Authenticated partners can submit referrals"
ON public.job_applications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = submitted_by_user_id
  AND intake_kind IN ('partner_referral','client_referral')
  AND company_id IS NULL
  AND consent_at IS NOT NULL
);

-- Submitter can SELECT only their own referrals
CREATE POLICY "Submitter can read own referrals"
ON public.job_applications
FOR SELECT
TO authenticated
USING (auth.uid() = submitted_by_user_id);

-- Submitter can UPDATE only their own referrals while still pending_review
CREATE POLICY "Submitter can update own pending referrals"
ON public.job_applications
FOR UPDATE
TO authenticated
USING (auth.uid() = submitted_by_user_id AND status = 'pending_review')
WITH CHECK (auth.uid() = submitted_by_user_id AND status = 'pending_review');

-- Global owners can manage anything in the pool (company_id IS NULL)
CREATE POLICY "Global owners can manage pool referrals"
ON public.job_applications
FOR ALL
TO authenticated
USING (is_global_owner(auth.uid()) AND company_id IS NULL)
WITH CHECK (is_global_owner(auth.uid()));

-- 7. Guard trigger: prevent submitter from writing admin/routing fields
CREATE OR REPLACE FUNCTION public.guard_job_application_submitter_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := false;
BEGIN
  -- If updater is global owner or company admin (current or destination), allow
  IF auth.uid() IS NULL THEN
    -- service role / triggers: allow
    RETURN NEW;
  END IF;

  IF is_global_owner(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.company_id IS NOT NULL AND user_is_company_admin(auth.uid(), OLD.company_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NOT NULL AND user_is_company_admin(auth.uid(), NEW.company_id) THEN
    RETURN NEW;
  END IF;

  -- Otherwise: this is the submitter editing own pending row. Block admin fields.
  IF NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.routed_company_id IS DISTINCT FROM OLD.routed_company_id
     OR NEW.linked_user_id IS DISTINCT FROM OLD.linked_user_id
     OR NEW.approved_employee_id IS DISTINCT FROM OLD.approved_employee_id
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.duplicate_of_application_id IS DISTINCT FROM OLD.duplicate_of_application_id
     OR NEW.duplicate_of_user_id IS DISTINCT FROM OLD.duplicate_of_user_id
     OR NEW.intake_kind IS DISTINCT FROM OLD.intake_kind
     OR NEW.source_partner_company_id IS DISTINCT FROM OLD.source_partner_company_id
  THEN
    RAISE EXCEPTION 'Submitters cannot modify routing or admin fields on referrals';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_job_application_submitter_update ON public.job_applications;
CREATE TRIGGER trg_guard_job_application_submitter_update
BEFORE UPDATE ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.guard_job_application_submitter_update();

-- Revoke direct EXECUTE on the trigger function (only postgres/service_role)
REVOKE EXECUTE ON FUNCTION public.guard_job_application_submitter_update() FROM PUBLIC, anon, authenticated;
