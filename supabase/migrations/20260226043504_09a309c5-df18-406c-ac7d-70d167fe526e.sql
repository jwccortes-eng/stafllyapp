
-- Create a sequence per company for shift codes
CREATE SEQUENCE IF NOT EXISTS public.shift_code_seq START 1;

-- Function to auto-assign shift_code on insert
CREATE OR REPLACE FUNCTION public.auto_assign_shift_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shift_code IS NULL OR NEW.shift_code = '' THEN
    NEW.shift_code := nextval('public.shift_code_seq')::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to auto-assign on insert
CREATE TRIGGER trg_auto_shift_code
  BEFORE INSERT ON public.scheduled_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_shift_code();

-- Backfill existing shifts that don't have a code
UPDATE public.scheduled_shifts 
SET shift_code = nextval('public.shift_code_seq')::text 
WHERE shift_code IS NULL OR shift_code = '';
