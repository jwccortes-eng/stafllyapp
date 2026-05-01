-- Fase 3: Schema hardening for multi-tenant governance

-- 1. Add new columns to companies (idempotent)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2. Allowed status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_status_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_status_check
      CHECK (status IN ('draft','needs_review','active','inactive','suspended','archived'));
  END IF;
END $$;

-- 3. Sync trigger: status drives is_active and archived_at
CREATE OR REPLACE FUNCTION public.sync_company_active_from_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_active := (NEW.status = 'active');

  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_active_from_status ON public.companies;
CREATE TRIGGER trg_sync_company_active_from_status
BEFORE INSERT OR UPDATE OF status ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.sync_company_active_from_status();

-- 4. Indexes for governance queries
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_source ON public.companies(source);
CREATE INDEX IF NOT EXISTS idx_companies_is_test ON public.companies(is_test) WHERE is_test = true;