-- 1) Secure RPC to register onboarding documents during activation.
--    Validates the invite token, employee/company linkage, document type and file path.
CREATE OR REPLACE FUNCTION public.register_onboarding_document(
  _invite_token text,
  _employee_id uuid,
  _company_id uuid,
  _document_type text,
  _file_url text,
  _file_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv RECORD;
  _doc_id uuid;
  _expected_prefix text;
BEGIN
  IF _invite_token IS NULL OR length(_invite_token) < 8 THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'check_violation';
  END IF;

  IF _document_type NOT IN ('driver_license','vehicle_registration','id_document','work_authorization','other') THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE' USING ERRCODE = 'check_violation';
  END IF;

  -- Look up the invitation. Must be active (not revoked/expired/superseded).
  SELECT id, employee_id, company_id, status, expires_at
    INTO _inv
    FROM public.employee_invitations
   WHERE invite_token = _invite_token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF _inv.status IN ('revoked','superseded','expired') THEN
    RAISE EXCEPTION 'INVITE_NOT_ACTIVE: %', _inv.status USING ERRCODE = 'check_violation';
  END IF;

  IF _inv.expires_at IS NOT NULL AND _inv.expires_at < now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF _inv.employee_id IS DISTINCT FROM _employee_id
     OR _inv.company_id IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'INVITE_MISMATCH' USING ERRCODE = 'check_violation';
  END IF;

  -- Enforce that file path is scoped to this employee's folder
  -- (matches the convention used by ActivateAccount: "<employee_id>/<docType>.<ext>")
  _expected_prefix := _employee_id::text || '/';
  IF _file_url IS NULL OR position(_expected_prefix in _file_url) <> 1 THEN
    RAISE EXCEPTION 'INVALID_FILE_PATH' USING ERRCODE = 'check_violation';
  END IF;

  -- Sanitize file_name length
  IF _file_name IS NOT NULL AND length(_file_name) > 255 THEN
    _file_name := substring(_file_name from 1 for 255);
  END IF;

  INSERT INTO public.employee_onboarding_documents (
    employee_id, company_id, document_type, file_url, file_name, status
  ) VALUES (
    _employee_id, _company_id, _document_type, _file_url, _file_name, 'pending'
  )
  ON CONFLICT (employee_id, document_type) DO UPDATE
    SET file_url = EXCLUDED.file_url,
        file_name = EXCLUDED.file_name,
        status = 'pending',
        uploaded_at = now(),
        verified_at = NULL,
        verified_by = NULL
  RETURNING id INTO _doc_id;

  RETURN _doc_id;
END;
$$;

-- Allow anon (activation page) and authenticated to call the secure function.
GRANT EXECUTE ON FUNCTION public.register_onboarding_document(text, uuid, uuid, text, text, text) TO anon, authenticated;

-- 2) Remove the open anon INSERT policy. All inserts must go via the function.
DROP POLICY IF EXISTS "Anon can insert onboarding docs during activation" ON public.employee_onboarding_documents;
