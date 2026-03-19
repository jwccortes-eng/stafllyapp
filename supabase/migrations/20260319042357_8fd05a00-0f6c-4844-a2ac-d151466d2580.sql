UPDATE migration_period_reconciliation
SET 
  connecteam_totals = '{"gross": 17768.00, "source": "manual_entry"}'::jsonb,
  stafly_totals = '{"gross": 17768.00, "source": "manual_entry"}'::jsonb,
  total_variance = 0.00,
  status = 'reconciled',
  reviewed_at = now(),
  updated_at = now()
WHERE id = '231858a8-ca9d-49c1-a95b-0ca22b24a2b2';
