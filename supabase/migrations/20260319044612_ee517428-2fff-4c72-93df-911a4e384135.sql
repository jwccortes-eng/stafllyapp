
UPDATE public.migration_pilot_status
SET 
  total_weeks_imported = (
    SELECT count(*) FROM public.migration_period_reconciliation 
    WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ),
  total_weeks_reconciled = (
    SELECT count(*) FROM public.migration_period_reconciliation 
    WHERE company_id = '00000000-0000-0000-0000-000000000001' 
    AND status IN ('reconciled', 'locked')
  ),
  total_unresolved_issues = (
    SELECT count(*) FROM public.migration_exceptions
    WHERE company_id = '00000000-0000-0000-0000-000000000001'
    AND status IN ('open', 'in_progress')
  ),
  updated_at = now()
WHERE company_id = '00000000-0000-0000-0000-000000000001';
