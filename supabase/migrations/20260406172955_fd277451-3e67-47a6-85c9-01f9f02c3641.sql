
-- Add missing columns to upgrade_requests
ALTER TABLE public.upgrade_requests
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS current_plan text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'app';

-- Update default status from 'pending' to 'new'
ALTER TABLE public.upgrade_requests ALTER COLUMN status SET DEFAULT 'new';

-- Update any existing 'pending' to 'new'
UPDATE public.upgrade_requests SET status = 'new' WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can insert upgrade requests for their company" ON public.upgrade_requests;
DROP POLICY IF EXISTS "Users can view their company upgrade requests" ON public.upgrade_requests;
DROP POLICY IF EXISTS "Global owners can manage all upgrade requests" ON public.upgrade_requests;

-- Company users can create requests
CREATE POLICY "Users can insert upgrade requests for their company"
ON public.upgrade_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND company_id IN (SELECT public.user_company_ids(auth.uid()))
);

-- Company users can view their own company's requests
CREATE POLICY "Users can view their company upgrade requests"
ON public.upgrade_requests FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  OR public.is_global_owner(auth.uid())
);

-- Global owners can update requests
CREATE POLICY "Global owners can manage all upgrade requests"
ON public.upgrade_requests FOR UPDATE TO authenticated
USING (public.is_global_owner(auth.uid()))
WITH CHECK (public.is_global_owner(auth.uid()));
