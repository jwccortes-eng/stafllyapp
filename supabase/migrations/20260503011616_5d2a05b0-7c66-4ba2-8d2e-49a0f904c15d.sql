
-- Helper: safe UUID extraction from storage path folder (returns NULL if invalid)
CREATE OR REPLACE FUNCTION public.try_path_uuid(path text, idx int)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  v uuid;
BEGIN
  IF path IS NULL THEN RETURN NULL; END IF;
  parts := storage.foldername(path);
  IF parts IS NULL OR array_length(parts,1) IS NULL OR array_length(parts,1) < idx THEN
    RETURN NULL;
  END IF;
  BEGIN
    v := parts[idx]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_path_uuid(text, int) TO authenticated, anon;

BEGIN;

-- =========================
-- A) company-logos
-- =========================
DROP POLICY IF EXISTS "Authenticated users can upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage company logos" ON storage.objects;

CREATE POLICY "company_logos_insert_scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
  )
);

CREATE POLICY "company_logos_update_scoped"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
  )
)
WITH CHECK (
  bucket_id = 'company-logos'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
  )
);

CREATE POLICY "company_logos_delete_scoped"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
  )
);

-- =========================
-- B) payroll-truth-files
-- =========================
DROP POLICY IF EXISTS "Company admins can upload payroll truth files" ON storage.objects;
DROP POLICY IF EXISTS "Company admins can view payroll truth files" ON storage.objects;
DROP POLICY IF EXISTS "Company admins can delete payroll truth files" ON storage.objects;

CREATE POLICY "payroll_truth_insert_scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payroll-truth-files'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
    OR public.has_action_permission(auth.uid(), public.try_path_uuid(name, 1), 'payroll.manage')
  )
);

CREATE POLICY "payroll_truth_select_scoped"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payroll-truth-files'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
    OR public.has_action_permission(auth.uid(), public.try_path_uuid(name, 1), 'payroll.manage')
  )
);

CREATE POLICY "payroll_truth_delete_scoped"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payroll-truth-files'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
    OR public.has_action_permission(auth.uid(), public.try_path_uuid(name, 1), 'payroll.manage')
  )
);

-- =========================
-- C) kiosk-photos (INSERT only per finding; SELECT already scoped)
-- =========================
DROP POLICY IF EXISTS "Authenticated users can upload kiosk photos" ON storage.objects;

CREATE POLICY "kiosk_photos_insert_scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'kiosk-photos'
  AND public.try_path_uuid(name, 1) IS NOT NULL
  AND public.try_path_uuid(name, 2) IS NOT NULL
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = public.try_path_uuid(name, 2)
        AND e.company_id = public.try_path_uuid(name, 1)
        AND e.user_id = auth.uid()
    )
  )
);

COMMIT;
