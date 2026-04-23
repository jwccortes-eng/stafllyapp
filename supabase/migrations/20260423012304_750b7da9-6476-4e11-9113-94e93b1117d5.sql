-- Add soft-delete column to employees so the existing 270+ frontend filters work
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Helpful partial index for active employees (the 99% case)
CREATE INDEX IF NOT EXISTS idx_employees_active_company
  ON public.employees (company_id)
  WHERE deleted_at IS NULL;