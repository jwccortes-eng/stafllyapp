
-- Inference evidence table for hourly rate traceability
CREATE TABLE public.hourly_rate_inference_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  compensation_profile_id uuid REFERENCES public.compensation_profiles(id),
  inferred_rate numeric NOT NULL,
  source_file text,
  source_record_label text,
  source_work_date date,
  source_qty numeric,
  source_rate numeric,
  source_amount numeric,
  match_method text NOT NULL DEFAULT 'concept_name',
  confidence text NOT NULL DEFAULT 'medium',
  imported_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hourly_rate_inference_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view inference evidence"
  ON public.hourly_rate_inference_evidence FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company users can insert inference evidence"
  ON public.hourly_rate_inference_evidence FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Add confirmation governance fields to compensation_profiles
ALTER TABLE public.compensation_profiles
  ADD COLUMN IF NOT EXISTS confirmed_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS previous_inferred_rate numeric DEFAULT NULL;
