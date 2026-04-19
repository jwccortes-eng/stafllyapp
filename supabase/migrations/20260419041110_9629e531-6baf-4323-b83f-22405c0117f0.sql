
-- ============================================================
-- UNIFIED PAY-PERIOD MODEL — Phase 1
-- Goal: pay_periods is the single calendar source of truth.
-- reconciliation_period_status is a session-style child (1:N
-- per pay_period for re-runs) with mandatory FK.
-- ============================================================

-- ── 1. BACKFILL orphaned reconciliation rows by matching dates ──
UPDATE reconciliation_period_status rps
SET period_id = pp.id,
    updated_at = now()
FROM pay_periods pp
WHERE rps.period_id IS NULL
  AND rps.company_id = pp.company_id
  AND rps.period_start = pp.start_date
  AND rps.period_end   = pp.end_date;

-- ── 2. Auto-create pay_periods for any remaining orphans
--     (defensive — should be 0 after step 1)
INSERT INTO pay_periods (company_id, start_date, end_date, status, calculation_mode)
SELECT DISTINCT rps.company_id, rps.period_start, rps.period_end,
       'closed', 'historical_import'
FROM reconciliation_period_status rps
WHERE rps.period_id IS NULL
  AND rps.status <> 'superseded'
  AND NOT EXISTS (
    SELECT 1 FROM pay_periods pp
    WHERE pp.company_id = rps.company_id
      AND pp.start_date = rps.period_start
  )
ON CONFLICT (company_id, start_date) DO NOTHING;

UPDATE reconciliation_period_status rps
SET period_id = pp.id, updated_at = now()
FROM pay_periods pp
WHERE rps.period_id IS NULL
  AND rps.company_id = pp.company_id
  AND rps.period_start = pp.start_date;

-- ── 3. Enforce mandatory FK going forward ──
ALTER TABLE reconciliation_period_status
  ALTER COLUMN period_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recon_period_status_period_id
  ON reconciliation_period_status(period_id);

-- ── 4. Add reconciliation_status mirror columns on pay_periods ──
-- These are *projected* views derived from the latest non-superseded
-- reconciliation_period_status row. Periods page reads these directly.
ALTER TABLE pay_periods
  ADD COLUMN IF NOT EXISTS reconciliation_status text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'organic'
    CHECK (source_type IN ('organic','imported','reconciled','hybrid')),
  ADD COLUMN IF NOT EXISTS last_reconciliation_id uuid
    REFERENCES reconciliation_period_status(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;

-- ── 5. Trigger: keep pay_periods mirror in sync ──
CREATE OR REPLACE FUNCTION public.sync_pay_period_recon_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pp_id uuid;
  _new_source text;
BEGIN
  _pp_id := COALESCE(NEW.period_id, OLD.period_id);
  IF _pp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Determine source_type: if any imports exist for this pp, mark imported/hybrid
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM imports i WHERE i.period_id = _pp_id) THEN 'reconciled'
    ELSE 'reconciled'
  END INTO _new_source;

  UPDATE pay_periods
  SET reconciliation_status = COALESCE(NEW.status, OLD.status),
      last_reconciliation_id = NEW.id,
      last_reconciled_at = now(),
      source_type = CASE
        WHEN source_type = 'organic' AND EXISTS (SELECT 1 FROM imports WHERE period_id = _pp_id) THEN 'hybrid'
        WHEN source_type = 'organic' THEN 'reconciled'
        ELSE source_type
      END
  WHERE id = _pp_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pay_period_recon ON reconciliation_period_status;
CREATE TRIGGER trg_sync_pay_period_recon
AFTER INSERT OR UPDATE OF status ON reconciliation_period_status
FOR EACH ROW EXECUTE FUNCTION public.sync_pay_period_recon_mirror();

-- ── 6. Trigger: imports flag pay_period as imported ──
CREATE OR REPLACE FUNCTION public.flag_pay_period_imported()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.period_id IS NOT NULL THEN
    UPDATE pay_periods
    SET source_type = CASE
      WHEN source_type = 'reconciled' THEN 'hybrid'
      WHEN source_type = 'organic' THEN 'imported'
      ELSE source_type
    END
    WHERE id = NEW.period_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_pp_imported ON imports;
CREATE TRIGGER trg_flag_pp_imported
AFTER INSERT ON imports
FOR EACH ROW EXECUTE FUNCTION public.flag_pay_period_imported();

-- ── 7. Backfill mirror for existing rows ──
UPDATE pay_periods pp
SET reconciliation_status = sub.status,
    last_reconciliation_id = sub.id,
    last_reconciled_at = sub.updated_at,
    source_type = CASE
      WHEN EXISTS (SELECT 1 FROM imports WHERE period_id = pp.id) THEN 'hybrid'
      ELSE 'reconciled'
    END
FROM (
  SELECT DISTINCT ON (period_id) id, period_id, status, updated_at
  FROM reconciliation_period_status
  WHERE status <> 'superseded'
  ORDER BY period_id, updated_at DESC
) sub
WHERE pp.id = sub.period_id;

UPDATE pay_periods pp
SET source_type = 'imported'
WHERE source_type = 'organic'
  AND EXISTS (SELECT 1 FROM imports WHERE period_id = pp.id);

-- ============================================================
-- PAYROLL SEQUENCE CONFIG (per-company, namespaced)
-- ============================================================

-- Trigger: BEFORE INSERT on pay_periods, assign sequence_number
-- according to company_settings.payroll_sequence config.
CREATE OR REPLACE FUNCTION public.assign_pay_period_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _config jsonb;
  _use boolean := false;
  _next_number int;
  _start int := 1;
  _scope text := 'all_time';
  _max_existing int;
BEGIN
  IF NEW.sequence_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _config
  FROM company_settings
  WHERE company_id = NEW.company_id AND key = 'payroll_sequence';

  IF _config IS NULL THEN RETURN NEW; END IF;

  _use := COALESCE((_config->>'use_payroll_sequence')::boolean, false);
  IF NOT _use THEN RETURN NEW; END IF;

  _start := COALESCE((_config->>'next_number')::int, 1);
  _scope := COALESCE(_config->>'scope', 'all_time');

  IF _scope = 'year' THEN
    SELECT COALESCE(MAX(sequence_number), _start - 1)
    INTO _max_existing
    FROM pay_periods
    WHERE company_id = NEW.company_id
      AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM NEW.start_date);
  ELSE
    SELECT COALESCE(MAX(sequence_number), _start - 1)
    INTO _max_existing
    FROM pay_periods
    WHERE company_id = NEW.company_id;
  END IF;

  _next_number := GREATEST(_max_existing + 1, _start);
  NEW.sequence_number := _next_number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pp_sequence ON pay_periods;
CREATE TRIGGER trg_assign_pp_sequence
BEFORE INSERT ON pay_periods
FOR EACH ROW EXECUTE FUNCTION public.assign_pay_period_sequence();
