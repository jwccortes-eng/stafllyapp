
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_access_enabled boolean NOT NULL DEFAULT false;
