
-- =============================================================
-- Sprint S5: SECURITY DEFINER grant cleanup (privileges only)
-- =============================================================

-- ----- P2: service_role only (cron / pgmq queues / internal) -----
DO $$
DECLARE
  fn text;
  sig text;
  funcs text[] := ARRAY[
    'public._get_cron_secret()',
    'public.cleanup_expired_rate_limits()',
    'public.expire_old_invitations()',
    'public.enqueue_email(text, jsonb)',
    'public.delete_email(text, bigint)',
    'public.read_email_batch(text, integer, integer)',
    'public.move_to_dlq(text, text, bigint, jsonb)'
  ];
BEGIN
  FOREACH sig IN ARRAY funcs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END$$;

-- ----- P1: authenticated + service_role (admin / worker app RPCs) -----
DO $$
DECLARE
  sig text;
  funcs text[] := ARRAY[
    -- shift state machine
    'public.assign_worker_to_shift(uuid, uuid, text, text, text)',
    'public.publish_shift_draft(uuid)',
    'public.set_shift_assignment_state(uuid, text, text, text, text)',
    'public.worker_respond_to_shift_assignment(uuid, text, text, text)',
    'public.resolve_shift_request(uuid, text, text, text)',
    -- time corrections
    'public.request_time_entry_correction(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, text)',
    'public.list_shift_corrections(uuid)',
    'public.review_time_entry_correction(uuid, text, text)',
    -- notifications + audit
    'public.create_shift_worker_notification(uuid, uuid, uuid, uuid, text, text, text, text)',
    'public.log_activity(text, text, text, uuid, jsonb)',
    'public.log_activity_detailed(text, text, text, uuid, jsonb, jsonb, jsonb)',
    'public.log_sensitive_access(text, uuid, text[])',
    -- documents intake
    'public.intake_confirm_and_index(uuid, uuid, text, text, text, text, bigint, date, text)',
    -- fiscal lookup (already authenticated; remove PUBLIC + anon)
    'public.admin_get_employees_with_fiscal(uuid)',
    -- worker client preferences
    'public.archive_worker_client_preference(uuid, text)',
    'public.set_worker_client_preference(uuid, uuid, uuid, text, text, text)',
    -- employee admin tooling
    'public.merge_employees(uuid, uuid[], text, text)',
    'public.supersede_employee_invitations(uuid, uuid, uuid)',
    'public.apply_role_template(uuid, uuid, uuid, boolean)',
    'public.list_unassigned_profiles()',
    'public.get_eligible_users_for_company(uuid)',
    'public.find_employee_duplicate_groups(uuid)',
    -- payroll / passport / review recompute (admin/cron-triggered, also called from admin UI)
    'public.consolidate_period_base_pay(uuid, uuid)',
    'public.consolidate_passport(uuid)',
    'public.consolidate_all_passports()',
    'public.recalculate_rep_score(uuid)',
    'public.recalculate_review_score(uuid, review_entity_type, uuid)',
    'public.generate_shift_review_requests(uuid)',
    'public.pick_workers_to_rate(uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY funcs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END$$;
