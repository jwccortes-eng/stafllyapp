ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS preferred_name text;
COMMENT ON COLUMN public.employees.preferred_name IS 'Alias operativo editable por el worker. No es identidad legal.';