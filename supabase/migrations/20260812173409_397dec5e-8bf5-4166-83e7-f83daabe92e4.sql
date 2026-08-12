DO $$
DECLARE
  qs uuid := '00000000-0000-0000-0000-000000000001';
  ms uuid := '37f92f75-7af4-4496-aa10-793e14b09ed9';
  ops uuid[] := ARRAY['e4793c12-8571-4d7d-bfcb-38391e12168d'::uuid,'96d4a770-87ce-484e-8cbc-97fb827bd561'::uuid,'4338b336-0f65-4285-9d50-6abcc28e5645'::uuid];
  c uuid; u uuid;
BEGIN
  UPDATE public.module_permissions
     SET can_view = false, can_edit = false, can_delete = false, updated_at = now()
   WHERE user_id = ANY(ops)
     AND module IN ('periods','movements','concepts','summary');

  UPDATE public.action_permissions
     SET granted = false, updated_at = now()
   WHERE user_id = ANY(ops)
     AND company_id IN (qs, ms)
     AND action IN ('approve_reconciliation_period','publish_reconciliation_period','reopen_reconciliation_period','edit_closed_period','view_period_audit');

  FOREACH c IN ARRAY ARRAY[qs, ms] LOOP
    FOREACH u IN ARRAY ops LOOP
      INSERT INTO public.activity_log (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (c, u, 'update', 'permissions', u,
        jsonb_build_object('ticket','operational-admin-access-2026-08-12','scope','payroll_access_revoked'));
    END LOOP;
  END LOOP;
END $$;