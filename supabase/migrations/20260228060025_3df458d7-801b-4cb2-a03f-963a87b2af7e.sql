
-- Add invite_code to companies for onboarding
ALTER TABLE public.companies ADD COLUMN invite_code text UNIQUE;

-- Generate initial codes for existing companies
UPDATE public.companies 
SET invite_code = UPPER(LEFT(REPLACE(slug, '-', ''), 4)) || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0')
WHERE invite_code IS NULL;

-- Make it NOT NULL after populating
ALTER TABLE public.companies ALTER COLUMN invite_code SET NOT NULL;

-- Function to generate unique invite codes
CREATE OR REPLACE FUNCTION generate_company_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := UPPER(LEFT(REPLACE(NEW.slug, '-', ''), 4)) || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_company_invite_code
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION generate_company_invite_code();
