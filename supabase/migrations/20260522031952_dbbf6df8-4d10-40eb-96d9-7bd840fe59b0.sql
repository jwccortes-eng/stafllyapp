
CREATE OR REPLACE FUNCTION public.intake_confirm_and_index(
  p_intake_item_id uuid,
  p_employee_id uuid,
  p_category text,
  p_file_url text,
  p_file_name text,
  p_file_type text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL,
  p_expires_at date DEFAULT NULL,
  p_review_status text DEFAULT 'pending'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.document_intake_items%ROWTYPE;
  v_emp_company uuid;
  v_uid uuid := auth.uid();
  v_doc_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_item FROM public.document_intake_items WHERE id = p_intake_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake item not found';
  END IF;

  IF v_item.status = 'indexed' THEN
    RAISE EXCEPTION 'Item already indexed';
  END IF;

  -- Authorization: tenant-scoped admin on the item's company.
  IF NOT (
    public.is_global_owner(v_uid)
    OR public.is_company_owner(v_uid, v_item.company_id)
    OR public.user_is_company_admin(v_uid, v_item.company_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for company %', v_item.company_id;
  END IF;

  -- Employee must exist and belong to the same company.
  SELECT company_id INTO v_emp_company FROM public.employees WHERE id = p_employee_id;
  IF v_emp_company IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_emp_company <> v_item.company_id THEN
    RAISE EXCEPTION 'Employee/company mismatch';
  END IF;

  IF p_review_status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION 'Invalid review_status';
  END IF;

  IF p_category IS NULL OR length(trim(p_category)) = 0 THEN
    RAISE EXCEPTION 'category required';
  END IF;
  IF p_file_url IS NULL OR length(trim(p_file_url)) = 0 THEN
    RAISE EXCEPTION 'file_url required';
  END IF;
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name required';
  END IF;

  INSERT INTO public.employee_documents (
    employee_id, company_id, name, file_url, file_type, file_size,
    category, uploaded_by, review_status, reviewed_by, reviewed_at, expires_at
  ) VALUES (
    p_employee_id, v_item.company_id, p_file_name, p_file_url, p_file_type, p_file_size,
    p_category, v_uid,
    p_review_status,
    CASE WHEN p_review_status = 'approved' THEN v_uid ELSE NULL END,
    CASE WHEN p_review_status = 'approved' THEN now() ELSE NULL END,
    p_expires_at
  )
  RETURNING id INTO v_doc_id;

  UPDATE public.document_intake_items
     SET status = 'indexed',
         reviewed_by = v_uid,
         reviewed_at = now(),
         indexed_employee_document_id = v_doc_id,
         suggested_employee_id = COALESCE(suggested_employee_id, p_employee_id),
         suggested_document_category = COALESCE(suggested_document_category, p_category),
         suggested_expires_at = COALESCE(suggested_expires_at, p_expires_at)
   WHERE id = p_intake_item_id;

  RETURN v_doc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.intake_confirm_and_index(uuid, uuid, text, text, text, text, bigint, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intake_confirm_and_index(uuid, uuid, text, text, text, text, bigint, date, text) TO authenticated;
