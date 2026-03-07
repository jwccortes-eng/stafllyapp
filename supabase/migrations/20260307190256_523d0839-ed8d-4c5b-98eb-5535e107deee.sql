
-- Add missing personal fields to employees
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS county text;

-- Create employee documents table
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  category text NOT NULL DEFAULT 'other',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- RLS: admins/owners/developers can manage docs for their company employees
CREATE POLICY "Company admins manage employee documents"
  ON public.employee_documents FOR ALL TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu 
      WHERE cu.user_id = auth.uid() AND cu.company_id = employee_documents.company_id
    )
  )
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu 
      WHERE cu.user_id = auth.uid() AND cu.company_id = employee_documents.company_id
    )
  );

-- Employees can view their own documents
CREATE POLICY "Employees view own documents"
  ON public.employee_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e 
      WHERE e.id = employee_documents.employee_id AND e.user_id = auth.uid()
    )
  );

-- Storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for employee documents bucket
CREATE POLICY "Company users upload employee docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Company users read employee docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
  );

CREATE POLICY "Admins delete employee docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      public.is_global_owner(auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    )
  );
