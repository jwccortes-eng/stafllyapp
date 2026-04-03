
-- Add new columns to job_applications
ALTER TABLE public.job_applications 
  ADD COLUMN IF NOT EXISTS application_type TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS role_suggestion TEXT,
  ADD COLUMN IF NOT EXISTS has_car BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_travel BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS linked_user_id UUID,
  ADD COLUMN IF NOT EXISTS duplicate_of_application_id UUID REFERENCES public.job_applications(id),
  ADD COLUMN IF NOT EXISTS duplicate_of_user_id UUID,
  ADD COLUMN IF NOT EXISTS draft_data JSONB,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[],
  ADD COLUMN IF NOT EXISTS experience_summary TEXT;

-- Index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_job_applications_email ON public.job_applications(email) WHERE email IS NOT NULL;

-- Application configs per tenant
CREATE TABLE IF NOT EXISTS public.application_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  application_enabled BOOLEAN NOT NULL DEFAULT true,
  require_email BOOLEAN NOT NULL DEFAULT false,
  require_document BOOLEAN NOT NULL DEFAULT false,
  require_work_auth BOOLEAN NOT NULL DEFAULT false,
  require_emergency_contact BOOLEAN NOT NULL DEFAULT false,
  allow_file_uploads BOOLEAN NOT NULL DEFAULT true,
  auto_send_invite_on_approval BOOLEAN NOT NULL DEFAULT false,
  visible_worker_types JSONB NOT NULL DEFAULT '["waiter","driver","cleaning","kitchen","other"]'::jsonb,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  optional_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  intro_text TEXT,
  cover_image_url TEXT,
  default_role_mapping JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.application_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view application config"
ON public.application_configs FOR SELECT TO authenticated
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company members can manage application config"
ON public.application_configs FOR ALL TO authenticated
USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Anon can read config for public apply page
CREATE POLICY "Anyone can read application config"
ON public.application_configs FOR SELECT TO anon
USING (application_enabled = true);

CREATE TRIGGER update_application_configs_updated_at
BEFORE UPDATE ON public.application_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Application events (audit trail)
CREATE TABLE IF NOT EXISTS public.application_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_application_events_app ON public.application_events(application_id);

ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view application events"
ON public.application_events FOR SELECT TO authenticated
USING (
  application_id IN (
    SELECT id FROM public.job_applications 
    WHERE company_id IN (SELECT public.user_company_ids(auth.uid()))
  )
);

CREATE POLICY "Anyone can insert application events"
ON public.application_events FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Application documents
CREATE TABLE IF NOT EXISTS public.application_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'id_document',
  file_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_application_documents_app ON public.application_documents(application_id);

ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can upload application documents"
ON public.application_documents FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Company members can view application documents"
ON public.application_documents FOR SELECT TO authenticated
USING (
  application_id IN (
    SELECT id FROM public.job_applications 
    WHERE company_id IN (SELECT public.user_company_ids(auth.uid()))
  )
);

-- Add application_enabled to companies table for quick access
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS application_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS application_intro TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS application_cover_url TEXT;
