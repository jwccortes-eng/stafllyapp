-- ========== ENUMS ==========
DO $$ BEGIN
  CREATE TYPE public.worker_type_enum AS ENUM (
    'server', 'bartender', 'cook', 'kitchen_help', 'runner',
    'host', 'security', 'driver', 'cleaner', 'event_staff', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.profile_stage_enum AS ENUM (
    'minimal', 'claim_ready', 'work_ready', 'payroll_ready'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.work_auth_status_enum AS ENUM (
    'citizen', 'permanent_resident', 'work_visa', 'ead', 'pending', 'not_provided'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== ALTER worker_profiles ==========
ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_worker_type public.worker_type_enum,
  ADD COLUMN IF NOT EXISTS work_authorization_status public.work_auth_status_enum
    DEFAULT 'not_provided',
  ADD COLUMN IF NOT EXISTS profile_completion_stage public.profile_stage_enum
    DEFAULT 'minimal' NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_profiles_stage
  ON public.worker_profiles(profile_completion_stage);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_primary_phone
  ON public.worker_profiles(primary_phone) WHERE primary_phone IS NOT NULL;

-- ========== Stage compute function ==========
CREATE OR REPLACE FUNCTION public.compute_profile_stage(_worker_profile_id UUID)
RETURNS public.profile_stage_enum
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wp RECORD;
  _has_id_doc BOOLEAN := false;
  _has_emergency BOOLEAN := false;
  _stage public.profile_stage_enum := 'minimal';
BEGIN
  SELECT primary_phone, first_name, last_name, avatar_url,
         primary_worker_type, english_level, city,
         work_authorization_status, emergency_contact_name, emergency_contact_phone
    INTO _wp
    FROM public.worker_profiles
   WHERE id = _worker_profile_id;

  IF NOT FOUND THEN RETURN 'minimal'; END IF;
  IF _wp.primary_phone IS NULL OR _wp.primary_phone = '' THEN RETURN 'minimal'; END IF;

  -- claim_ready: identity + worker_type + english + borough/city
  IF _wp.first_name IS NOT NULL AND _wp.first_name <> ''
     AND _wp.last_name IS NOT NULL AND _wp.last_name <> ''
     AND _wp.avatar_url IS NOT NULL AND _wp.avatar_url <> ''
     AND _wp.primary_worker_type IS NOT NULL
     AND _wp.english_level IS NOT NULL
     AND _wp.city IS NOT NULL AND _wp.city <> ''
  THEN
    _stage := 'claim_ready';
  ELSE
    RETURN _stage;
  END IF;

  -- work_ready: + work_auth + emergency contact + identity doc
  SELECT EXISTS (
    SELECT 1 FROM public.worker_documents
    WHERE worker_profile_id = _worker_profile_id
      AND deleted_at IS NULL
      AND document_type IN ('id', 'identification', 'passport', 'drivers_license', 'work_authorization')
  ) INTO _has_id_doc;

  _has_emergency := _wp.emergency_contact_name IS NOT NULL
                AND _wp.emergency_contact_phone IS NOT NULL;

  IF _wp.work_authorization_status IS NOT NULL
     AND _wp.work_authorization_status <> 'not_provided'
     AND _has_emergency
     AND _has_id_doc
  THEN
    _stage := 'work_ready';
  ELSE
    RETURN _stage;
  END IF;

  -- payroll_ready: + tax doc (W9 / W4 / contractor doc)
  IF EXISTS (
    SELECT 1 FROM public.worker_documents
    WHERE worker_profile_id = _worker_profile_id
      AND deleted_at IS NULL
      AND document_type IN ('w9', 'w4', 'tax_form', 'contractor_agreement')
  ) THEN
    _stage := 'payroll_ready';
  END IF;

  RETURN _stage;
END;
$$;

-- ========== Trigger to recompute stage ==========
CREATE OR REPLACE FUNCTION public.recompute_worker_profile_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wp_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'worker_profiles' THEN
    _wp_id := NEW.id;
  ELSE
    _wp_id := COALESCE(NEW.worker_profile_id, OLD.worker_profile_id);
  END IF;

  IF _wp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.worker_profiles
     SET profile_completion_stage = public.compute_profile_stage(_wp_id)
   WHERE id = _wp_id
     AND profile_completion_stage IS DISTINCT FROM public.compute_profile_stage(_wp_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_profiles_recompute_stage ON public.worker_profiles;
CREATE TRIGGER trg_worker_profiles_recompute_stage
AFTER INSERT OR UPDATE OF first_name, last_name, avatar_url, primary_worker_type,
                          english_level, city, work_authorization_status,
                          emergency_contact_name, emergency_contact_phone,
                          primary_phone
ON public.worker_profiles
FOR EACH ROW EXECUTE FUNCTION public.recompute_worker_profile_stage();

DROP TRIGGER IF EXISTS trg_worker_documents_recompute_stage ON public.worker_documents;
CREATE TRIGGER trg_worker_documents_recompute_stage
AFTER INSERT OR UPDATE OR DELETE
ON public.worker_documents
FOR EACH ROW EXECUTE FUNCTION public.recompute_worker_profile_stage();

-- ========== BACKFILL from employees ==========
UPDATE public.worker_profiles wp
   SET first_name = COALESCE(wp.first_name, e.first_name),
       last_name  = COALESCE(wp.last_name, e.last_name),
       avatar_url = COALESCE(wp.avatar_url, e.avatar_url)
  FROM (
    SELECT DISTINCT ON (user_id)
      user_id, first_name, last_name, avatar_url
    FROM public.employees
    WHERE is_active = true AND user_id IS NOT NULL
    ORDER BY user_id, created_at ASC
  ) e
 WHERE wp.user_id = e.user_id;

-- Recompute stage for all existing rows
UPDATE public.worker_profiles
   SET profile_completion_stage = public.compute_profile_stage(id);

-- ========== STORAGE BUCKETS (private) ==========
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-documents', 'worker-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ========== HELPER: is admin of any company where worker has employee ==========
CREATE OR REPLACE FUNCTION public.user_can_access_worker_docs(_user_id UUID, _worker_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Owner of the worker_profile
  SELECT EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    WHERE wp.id = _worker_profile_id AND wp.user_id = _user_id
  )
  -- OR admin of a company where this worker has an active employee record
  OR EXISTS (
    SELECT 1
      FROM public.employees e
      JOIN public.worker_profiles wp ON wp.user_id = e.user_id
     WHERE wp.id = _worker_profile_id
       AND e.is_active = true
       AND public.user_is_company_admin(_user_id, e.company_id)
  )
  -- OR global owner/developer
  OR public.has_role(_user_id, 'admin'::app_role)
$$;

-- ========== RLS for worker-documents bucket ==========
DROP POLICY IF EXISTS "worker_docs_select" ON storage.objects;
CREATE POLICY "worker_docs_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'worker-documents'
  AND public.user_can_access_worker_docs(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
);

DROP POLICY IF EXISTS "worker_docs_insert" ON storage.objects;
CREATE POLICY "worker_docs_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'worker-documents'
  AND EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    WHERE wp.id = NULLIF((storage.foldername(name))[1], '')::uuid
      AND wp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "worker_docs_update" ON storage.objects;
CREATE POLICY "worker_docs_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'worker-documents'
  AND EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    WHERE wp.id = NULLIF((storage.foldername(name))[1], '')::uuid
      AND wp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "worker_docs_delete" ON storage.objects;
CREATE POLICY "worker_docs_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'worker-documents'
  AND EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    WHERE wp.id = NULLIF((storage.foldername(name))[1], '')::uuid
      AND wp.user_id = auth.uid()
  )
);

-- ========== RLS for company-documents bucket ==========
-- Path: {company_id}/{employee_id}/{file}
DROP POLICY IF EXISTS "company_docs_select" ON storage.objects;
CREATE POLICY "company_docs_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'company-documents'
  AND (
    -- Admin of the company
    public.user_is_company_admin(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
    -- OR the employee themselves
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = NULLIF((storage.foldername(name))[2], '')::uuid
        AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "company_docs_insert" ON storage.objects;
CREATE POLICY "company_docs_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-documents'
  AND (
    public.user_is_company_admin(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = NULLIF((storage.foldername(name))[2], '')::uuid
        AND e.user_id = auth.uid()
        AND e.company_id = NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

DROP POLICY IF EXISTS "company_docs_update" ON storage.objects;
CREATE POLICY "company_docs_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-documents'
  AND public.user_is_company_admin(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
);

DROP POLICY IF EXISTS "company_docs_delete" ON storage.objects;
CREATE POLICY "company_docs_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'company-documents'
  AND public.user_is_company_admin(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
);