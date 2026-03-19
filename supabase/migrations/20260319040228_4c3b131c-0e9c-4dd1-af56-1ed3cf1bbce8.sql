
ALTER TABLE public.migration_period_reconciliation
ADD COLUMN period_code smallint;

COMMENT ON COLUMN public.migration_period_reconciliation.period_code IS 'Código incremental de 3 dígitos que identifica la semana de nómina (ej: 112, 113...)';

CREATE UNIQUE INDEX idx_migration_period_code_company
ON public.migration_period_reconciliation (company_id, period_code)
WHERE period_code IS NOT NULL;

INSERT INTO public.migration_period_reconciliation (company_id, week_start, week_end, status, period_code)
VALUES
  ('00000000-0000-0000-0000-000000000001', '2025-12-24', '2025-12-30', 'draft_imported', 112),
  ('00000000-0000-0000-0000-000000000001', '2025-12-31', '2026-01-06', 'draft_imported', 113),
  ('00000000-0000-0000-0000-000000000001', '2026-01-07', '2026-01-13', 'draft_imported', 114),
  ('00000000-0000-0000-0000-000000000001', '2026-01-14', '2026-01-20', 'draft_imported', 115),
  ('00000000-0000-0000-0000-000000000001', '2026-01-21', '2026-01-27', 'draft_imported', 116),
  ('00000000-0000-0000-0000-000000000001', '2026-01-28', '2026-02-03', 'draft_imported', 117),
  ('00000000-0000-0000-0000-000000000001', '2026-02-04', '2026-02-10', 'draft_imported', 118),
  ('00000000-0000-0000-0000-000000000001', '2026-02-11', '2026-02-17', 'draft_imported', 119),
  ('00000000-0000-0000-0000-000000000001', '2026-02-18', '2026-02-24', 'draft_imported', 120),
  ('00000000-0000-0000-0000-000000000001', '2026-02-25', '2026-03-03', 'draft_imported', 121),
  ('00000000-0000-0000-0000-000000000001', '2026-03-04', '2026-03-10', 'draft_imported', 122)
ON CONFLICT DO NOTHING;
