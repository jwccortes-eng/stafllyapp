
UPDATE public.migration_period_reconciliation
SET period_code = CASE
  WHEN week_start = '2025-12-31' THEN 113
  WHEN week_start = '2026-01-07' THEN 114
  WHEN week_start = '2026-01-14' THEN 115
  WHEN week_start = '2026-01-21' THEN 116
  WHEN week_start = '2026-01-28' THEN 117
  WHEN week_start = '2026-02-04' THEN 118
  WHEN week_start = '2026-02-11' THEN 119
  WHEN week_start = '2026-02-18' THEN 120
  WHEN week_start = '2026-02-25' THEN 121
  WHEN week_start = '2026-03-04' THEN 122
  WHEN week_start = '2026-03-11' THEN 123
END
WHERE company_id = '00000000-0000-0000-0000-000000000001'
  AND period_code IS NULL;

DELETE FROM public.migration_period_reconciliation
WHERE company_id = '00000000-0000-0000-0000-000000000001'
  AND id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, week_start ORDER BY period_code NULLS LAST) rn
      FROM public.migration_period_reconciliation
      WHERE company_id = '00000000-0000-0000-0000-000000000001'
    ) t WHERE rn > 1
  );
