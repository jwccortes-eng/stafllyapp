
-- Table for tracking onboarding documents (driver license, vehicle registration, etc.)
CREATE TABLE IF NOT EXISTS public.employee_onboarding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('driver_license', 'vehicle_registration', 'id_document', 'work_authorization', 'other')),
  file_url text NOT NULL,
  file_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, document_type)
);

ALTER TABLE public.employee_onboarding_documents ENABLE ROW LEVEL SECURITY;

-- Admins can view docs for their company employees
CREATE POLICY "Company admins can view onboarding docs"
ON public.employee_onboarding_documents FOR SELECT
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  OR public.is_global_owner(auth.uid())
);

-- Admins can manage docs
CREATE POLICY "Company admins can manage onboarding docs"
ON public.employee_onboarding_documents FOR ALL
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid() AND cu.company_id = employee_onboarding_documents.company_id
    AND cu.role IN ('admin', 'company_owner')
  )
);

-- Allow anon inserts for onboarding flow (employee uploads during activation)
CREATE POLICY "Anon can insert onboarding docs during activation"
ON public.employee_onboarding_documents FOR INSERT
TO anon
WITH CHECK (true);

-- Storage: allow anon uploads to employee-documents bucket for onboarding
CREATE POLICY "Anon can upload employee docs during onboarding"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'employee-documents');

-- Storage: allow authenticated uploads too
CREATE POLICY "Authenticated can upload employee docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'employee-documents');

-- Add languages column to employees if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='languages') THEN
    ALTER TABLE public.employees ADD COLUMN languages text[];
  END IF;
END $$;
