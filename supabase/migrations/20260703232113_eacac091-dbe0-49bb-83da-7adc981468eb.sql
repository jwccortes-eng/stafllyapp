-- =====================================================================
-- Phase 1: Pending Identity / Emergency Worker · schema + safe backfill
-- Idempotent. Multi-tenant safe. No writes to payroll/time_entries/auth.
-- =====================================================================

-- 1. Columns ------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS worker_type text NOT NULL DEFAULT 'real_employee',
  ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS requires_identity_resolution boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payroll_approval_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_placeholder_name text,
  ADD COLUMN IF NOT EXISTS identity_resolved_employee_id uuid,
  ADD COLUMN IF NOT EXISTS identity_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_resolved_by uuid,
  ADD COLUMN IF NOT EXISTS identity_notes text,
  ADD COLUMN IF NOT EXISTS identity_source text,
  ADD COLUMN IF NOT EXISTS resolved_person_id uuid; -- future passport hook, no FK

-- 2. Value constraints (drop-if-exists so migration is re-runnable) -----
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_worker_type_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_worker_type_check
  CHECK (worker_type IN ('real_employee','emergency_worker','legacy_placeholder','imported_placeholder'));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_identity_status_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_identity_status_check
  CHECK (identity_status IN ('verified','pending_identity','unresolved','rejected','merged','legacy_placeholder'));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_identity_source_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_identity_source_check
  CHECK (identity_source IS NULL OR identity_source IN ('import','manual','emergency','connecteam','legacy','backfill'));

-- Self-FK for resolved employee (nullable, ON DELETE SET NULL).
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_identity_resolved_employee_id_fkey;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_identity_resolved_employee_id_fkey
  FOREIGN KEY (identity_resolved_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- 3. Same-company validation trigger -----------------------------------
CREATE OR REPLACE FUNCTION public.validate_identity_resolution_same_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_company uuid;
BEGIN
  IF NEW.identity_resolved_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.identity_resolved_employee_id = NEW.id THEN
    RAISE EXCEPTION 'identity_resolved_employee_id cannot equal the row id (self-resolution not allowed)';
  END IF;

  SELECT company_id INTO target_company
  FROM public.employees
  WHERE id = NEW.identity_resolved_employee_id;

  IF target_company IS NULL THEN
    RAISE EXCEPTION 'identity_resolved_employee_id % not found', NEW.identity_resolved_employee_id;
  END IF;

  IF target_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Cross-tenant identity resolution blocked: source company % vs target company %',
      NEW.company_id, target_company;
  END IF;

  RETURN NEW;
END;
$$;

-- Lock down execution (Phase 2A.1 pattern: trigger handler; not callable via RPC).
REVOKE ALL ON FUNCTION public.validate_identity_resolution_same_company() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_identity_resolution_same_company ON public.employees;
CREATE TRIGGER trg_validate_identity_resolution_same_company
BEFORE INSERT OR UPDATE OF identity_resolved_employee_id ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.validate_identity_resolution_same_company();

-- 4. Per-column grants (Phase 1.5 column-whitelist model) --------------
-- Read: authenticated + anon (same baseline as other operational cols).
GRANT SELECT (
  worker_type,
  identity_status,
  requires_identity_resolution,
  payroll_approval_blocked,
  original_placeholder_name,
  identity_resolved_employee_id,
  identity_resolved_at,
  identity_resolved_by,
  identity_notes,
  identity_source,
  resolved_person_id
) ON public.employees TO authenticated, anon;

-- Write: authenticated only (admin RLS on employees still governs which rows).
GRANT UPDATE (
  worker_type,
  identity_status,
  requires_identity_resolution,
  payroll_approval_blocked,
  original_placeholder_name,
  identity_resolved_employee_id,
  identity_resolved_at,
  identity_resolved_by,
  identity_notes,
  identity_source,
  resolved_person_id
) ON public.employees TO authenticated;

-- 5. Helpful indexes (partial, low-cost) -------------------------------
CREATE INDEX IF NOT EXISTS employees_identity_status_idx
  ON public.employees (company_id, identity_status)
  WHERE identity_status <> 'verified';

CREATE INDEX IF NOT EXISTS employees_requires_identity_resolution_idx
  ON public.employees (company_id)
  WHERE requires_identity_resolution = true;

-- 6. Conservative idempotent backfill ----------------------------------
-- Rules (approved in Phase 1):
--   * Only rows whose name matches the existing placeholder regex.
--   * Only touch rows still at defaults (verified / real_employee) so
--     the migration is safe to re-run and never overrides manual work.
--   * NEVER set payroll_approval_blocked. NEVER touch portal_access_enabled.
--   * Preserve original name in original_placeholder_name.
--   * Applies globally (all tenants) but is naturally scoped per row.
WITH placeholder_rows AS (
  SELECT id, first_name, last_name, added_via, created_from_reconciliation
  FROM public.employees
  WHERE identity_status = 'verified'          -- untouched by prior runs
    AND worker_type    = 'real_employee'
    AND (
      COALESCE(first_name,'') ~* '^(system|user\s*pend|unknown|temp|placeholder|pending)\s*[0-9]*\s*$'
      OR COALESCE(last_name,'')  ~* '^(system|user\s*pend|unknown|temp|placeholder|pending)\s*[0-9]*\s*$'
      OR (COALESCE(first_name,'') = '' AND COALESCE(last_name,'') = '')
    )
)
UPDATE public.employees e
SET
  identity_status = 'pending_identity',
  worker_type = CASE
    WHEN p.added_via IN ('import','connecteam','reconciliation')
      OR p.created_from_reconciliation = true
      THEN 'imported_placeholder'
    ELSE 'legacy_placeholder'
  END,
  requires_identity_resolution = true,
  original_placeholder_name = COALESCE(
    e.original_placeholder_name,
    NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '')
  ),
  identity_source = COALESCE(e.identity_source, 'backfill')
FROM placeholder_rows p
WHERE e.id = p.id;

-- 7. Sanity: assert payroll_approval_blocked was NOT set by this migration.
DO $$
DECLARE blocked_count int;
BEGIN
  SELECT count(*) INTO blocked_count
  FROM public.employees WHERE payroll_approval_blocked = true;
  IF blocked_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 guardrail: payroll_approval_blocked must remain 0, found %', blocked_count;
  END IF;
END $$;
