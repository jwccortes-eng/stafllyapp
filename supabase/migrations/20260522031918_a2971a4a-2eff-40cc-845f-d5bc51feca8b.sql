
CREATE TABLE public.document_intake_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','processing','ready_for_review','completed','failed')),
  total_files integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_batches_company ON public.document_intake_batches(company_id, created_at DESC);
CREATE INDEX idx_intake_batches_status  ON public.document_intake_batches(company_id, status);

CREATE TABLE public.document_intake_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.document_intake_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  storage_path text NOT NULL,
  original_filename text,
  mime_type text,
  status text NOT NULL DEFAULT 'pending_extraction'
    CHECK (status IN ('pending_extraction','extracted','needs_review','indexed','rejected','failed')),
  extracted_json jsonb,
  suggested_employee_id uuid,
  suggested_document_category text,
  suggested_document_side text
    CHECK (suggested_document_side IS NULL OR suggested_document_side IN ('front','back','full','unknown')),
  suggested_expires_at date,
  suggested_document_number_masked text,
  confidence_score numeric(3,2)
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  confidence_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  indexed_employee_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_items_batch    ON public.document_intake_items(batch_id);
CREATE INDEX idx_intake_items_company  ON public.document_intake_items(company_id, status, created_at DESC);
CREATE INDEX idx_intake_items_emp      ON public.document_intake_items(suggested_employee_id);

ALTER TABLE public.document_intake_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_intake_items   ENABLE ROW LEVEL SECURITY;

-- Mirrors the existing employee_documents admin pattern.
CREATE POLICY "Admins manage intake_batches in their company" ON public.document_intake_batches
  FOR ALL TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.user_is_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.user_is_company_admin(auth.uid(), company_id)
  );

CREATE POLICY "Admins manage intake_items in their company" ON public.document_intake_items
  FOR ALL TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.user_is_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.user_is_company_admin(auth.uid(), company_id)
  );

REVOKE ALL ON public.document_intake_batches FROM anon;
REVOKE ALL ON public.document_intake_items   FROM anon;
