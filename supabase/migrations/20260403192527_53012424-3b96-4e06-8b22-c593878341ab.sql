
-- Create job_applications table
CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  worker_type TEXT NOT NULL DEFAULT 'other',
  city TEXT,
  availability TEXT DEFAULT 'full_time',
  can_drive BOOLEAN DEFAULT false,
  document_url TEXT,
  ssn_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reference_code TEXT NOT NULL DEFAULT '',
  notes TEXT,
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for company + status queries
CREATE INDEX idx_job_applications_company_status ON public.job_applications(company_id, status);
CREATE INDEX idx_job_applications_phone ON public.job_applications(phone);

-- Auto-generate reference code
CREATE OR REPLACE FUNCTION public.auto_generate_application_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _seq BIGINT;
BEGIN
  IF NEW.reference_code IS NULL OR NEW.reference_code = '' THEN
    _seq := nextval('public.application_ref_seq');
    NEW.reference_code := 'APP-' || LPAD(_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS public.application_ref_seq START 1;

CREATE TRIGGER trg_auto_application_ref
BEFORE INSERT ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.auto_generate_application_ref();

-- Updated at trigger
CREATE TRIGGER update_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can INSERT (public application form, no auth)
CREATE POLICY "Anyone can submit applications"
ON public.job_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Company members can view their company's applications
CREATE POLICY "Company members can view applications"
ON public.job_applications
FOR SELECT
TO authenticated
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Company members can update applications (approve/reject)
CREATE POLICY "Company members can update applications"
ON public.job_applications
FOR UPDATE
TO authenticated
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Storage bucket for application documents
INSERT INTO storage.buckets (id, name, public) VALUES ('application-documents', 'application-documents', false)
ON CONFLICT DO NOTHING;

-- Anyone can upload application documents
CREATE POLICY "Anyone can upload application docs"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'application-documents');

-- Company members can view application documents
CREATE POLICY "Company members can view application docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'application-documents');
