ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS available_for_work boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approx_latitude double precision,
  ADD COLUMN IF NOT EXISTS approx_longitude double precision;