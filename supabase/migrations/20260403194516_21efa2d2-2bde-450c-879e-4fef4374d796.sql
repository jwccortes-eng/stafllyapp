
-- Add columns to track approval outcome
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS approved_employee_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS approval_payload jsonb;
