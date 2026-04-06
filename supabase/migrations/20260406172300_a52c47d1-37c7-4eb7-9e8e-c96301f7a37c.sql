-- Add plan management fields to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan_code text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS max_employees integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_admins integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS paid_features_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_activated_by uuid,
  ADD COLUMN IF NOT EXISTS upgrade_requested_at timestamptz;

-- Create upgrade_requests table
CREATE TABLE IF NOT EXISTS public.upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  plan_requested text NOT NULL DEFAULT 'paid_manual',
  status text NOT NULL DEFAULT 'pending',
  notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create upgrade requests
CREATE POLICY "Users can create upgrade requests"
  ON public.upgrade_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Users can view upgrade requests for companies they belong to
CREATE POLICY "Users can view own company upgrade requests"
  ON public.upgrade_requests
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_company ON public.upgrade_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON public.upgrade_requests(status);

-- Add trigger for updated_at
CREATE TRIGGER update_upgrade_requests_updated_at
  BEFORE UPDATE ON public.upgrade_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();