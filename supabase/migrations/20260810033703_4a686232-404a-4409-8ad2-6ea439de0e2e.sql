-- 1. Human-readable stable client code + aliases
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_code text,
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];

CREATE SEQUENCE IF NOT EXISTS public.client_code_seq START 1;

CREATE OR REPLACE FUNCTION public.assign_client_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_code IS NULL OR NEW.client_code = '' THEN
    NEW.client_code := 'CL-' || lpad(nextval('public.client_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_client_code_trigger ON public.clients;
CREATE TRIGGER assign_client_code_trigger
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.assign_client_code();

-- Backfill deterministically by creation order
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.clients WHERE client_code IS NULL ORDER BY created_at, id LOOP
    UPDATE public.clients
      SET client_code = 'CL-' || lpad(nextval('public.client_code_seq')::text, 6, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clients_client_code_key ON public.clients (client_code);

-- 2. Duplicate review decisions (no merges, decisions only)
CREATE TABLE IF NOT EXISTS public.client_duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_a_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_b_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('not_duplicate','needs_review','consolidated')),
  notes text,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_duplicate_reviews_pair_order CHECK (client_a_id < client_b_id),
  CONSTRAINT client_duplicate_reviews_unique_pair UNIQUE (company_id, client_a_id, client_b_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_duplicate_reviews TO authenticated;
GRANT ALL ON public.client_duplicate_reviews TO service_role;

ALTER TABLE public.client_duplicate_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view client duplicate reviews"
ON public.client_duplicate_reviews FOR SELECT TO authenticated
USING (company_id IN (SELECT user_company_ids(auth.uid())));

CREATE POLICY "Company managers can record client duplicate reviews"
ON public.client_duplicate_reviews FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_module_permission(auth.uid(), 'clients', 'edit'))
);

CREATE POLICY "Company managers can update client duplicate reviews"
ON public.client_duplicate_reviews FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_module_permission(auth.uid(), 'clients', 'edit'))
);

CREATE POLICY "Owners can manage client duplicate reviews"
ON public.client_duplicate_reviews FOR ALL TO authenticated
USING (is_global_owner(auth.uid()))
WITH CHECK (is_global_owner(auth.uid()));

CREATE TRIGGER update_client_duplicate_reviews_updated_at
BEFORE UPDATE ON public.client_duplicate_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();