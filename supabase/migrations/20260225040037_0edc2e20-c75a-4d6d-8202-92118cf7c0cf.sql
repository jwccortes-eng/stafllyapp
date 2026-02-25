-- Fix: concepts name should be unique per company, not globally
ALTER TABLE public.concepts DROP CONSTRAINT concepts_name_key;
CREATE UNIQUE INDEX concepts_name_company_unique ON public.concepts (name, company_id);