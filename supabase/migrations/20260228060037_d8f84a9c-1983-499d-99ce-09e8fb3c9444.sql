
-- Fix search_path on the new function
CREATE OR REPLACE FUNCTION public.generate_company_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := UPPER(LEFT(REPLACE(NEW.slug, '-', ''), 4)) || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
