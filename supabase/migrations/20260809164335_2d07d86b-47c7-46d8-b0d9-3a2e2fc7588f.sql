CREATE UNIQUE INDEX IF NOT EXISTS scheduled_shifts_company_reconciliation_hash_uniq
ON public.scheduled_shifts (company_id, reconciliation_hash)
WHERE reconciliation_hash IS NOT NULL AND deleted_at IS NULL;