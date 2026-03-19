
-- Drop global phone uniqueness (blocks multi-company shared employees)
ALTER TABLE public.employees DROP CONSTRAINT employees_phone_number_key;

-- Add company-scoped phone uniqueness (same phone can exist in different companies)
ALTER TABLE public.employees ADD CONSTRAINT employees_phone_company_unique UNIQUE (phone_number, company_id);
