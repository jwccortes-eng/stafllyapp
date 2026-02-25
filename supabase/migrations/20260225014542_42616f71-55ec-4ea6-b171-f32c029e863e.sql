
-- Add access_pin column for employee authentication
ALTER TABLE public.employees ADD COLUMN access_pin text;

-- Generate 6-digit PINs for existing employees that have phone numbers
UPDATE public.employees 
SET access_pin = LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0')
WHERE phone_number IS NOT NULL AND access_pin IS NULL;
