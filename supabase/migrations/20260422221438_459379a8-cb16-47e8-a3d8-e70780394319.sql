-- 1. Add review/validation columns to employee_documents
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 2. Constrain valid review status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_documents_review_status_check'
  ) THEN
    ALTER TABLE public.employee_documents
      ADD CONSTRAINT employee_documents_review_status_check
      CHECK (review_status IN ('pending','approved','rejected'));
  END IF;
END $$;

-- 3. BACKWARD COMPAT: existing documents should be considered 'approved' so
-- current readiness/payroll behavior does not change for active workers.
UPDATE public.employee_documents
   SET review_status = 'approved',
       reviewed_at   = COALESCE(reviewed_at, created_at)
 WHERE review_status = 'pending'
   AND created_at < now();

-- 4. Update readiness: only APPROVED documents satisfy the requirement.
-- Pending/Rejected keep the worker in 'pending_documents' state.
CREATE OR REPLACE FUNCTION public.compute_employee_profile_status(_employee_id uuid)
 RETURNS employee_profile_status
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _e RECORD;
  _required_docs text[];
  _doc_categories text[];
  _missing_doc text;
  _has_personal boolean;
BEGIN
  SELECT id, company_id, first_name, last_name, phone_number,
         date_of_birth, ssn_last4,
         address_line, address_city, address_state, address_zip,
         employee_role, can_drive, last_login, portal_access_enabled
    INTO _e
    FROM public.employees
   WHERE id = _employee_id;

  IF NOT FOUND THEN RETURN 'incomplete'; END IF;

  _has_personal :=
       _e.first_name      IS NOT NULL AND _e.first_name      <> ''
   AND _e.last_name       IS NOT NULL AND _e.last_name       <> ''
   AND _e.phone_number    IS NOT NULL AND _e.phone_number    <> ''
   AND _e.date_of_birth   IS NOT NULL
   AND _e.ssn_last4       IS NOT NULL AND length(_e.ssn_last4) = 4
   AND _e.address_line    IS NOT NULL AND _e.address_line    <> ''
   AND _e.address_city    IS NOT NULL AND _e.address_city    <> ''
   AND _e.address_state   IS NOT NULL AND _e.address_state   <> ''
   AND _e.address_zip     IS NOT NULL AND _e.address_zip     <> ''
   AND _e.employee_role   IS NOT NULL AND _e.employee_role   <> '';

  IF NOT _has_personal THEN
    RETURN 'incomplete';
  END IF;

  _required_docs := public.get_required_documents_for_company(_e.company_id);

  IF COALESCE(_e.can_drive, false)
     AND NOT ('drivers_license' = ANY(_required_docs))
     AND NOT ('driver_license' = ANY(_required_docs))
  THEN
    _required_docs := array_append(_required_docs, 'drivers_license');
  END IF;

  -- Only APPROVED documents count as fulfilling a requirement.
  SELECT COALESCE(array_agg(DISTINCT lower(category)), ARRAY[]::text[])
    INTO _doc_categories
    FROM public.employee_documents
   WHERE employee_id = _employee_id
     AND category IS NOT NULL
     AND review_status = 'approved';

  FOREACH _missing_doc IN ARRAY _required_docs LOOP
    IF NOT (lower(_missing_doc) = ANY(_doc_categories)) THEN
      RETURN 'pending_documents';
    END IF;
  END LOOP;

  IF COALESCE(_e.portal_access_enabled, false) AND _e.last_login IS NOT NULL THEN
    RETURN 'active';
  END IF;

  RETURN 'ready';
END;
$function$;

-- 5. Helpful index for filtering by review_status per employee
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_review
  ON public.employee_documents(employee_id, review_status);