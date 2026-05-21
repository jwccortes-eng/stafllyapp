
-- Security Phase 2A.1: SECURITY DEFINER grant hygiene for trigger handlers
-- Revokes EXECUTE from PUBLIC, anon, authenticated on 40 trigger-only functions.
-- postgres and service_role retain access. Function bodies and triggers untouched.

REVOKE EXECUTE ON FUNCTION public.assert_shift_review_eligibility() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_office_visit_case_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_pay_period_sequence() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_service_request_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_service_request_shift_link() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_service_requests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_employer_identification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_stop_prior_location_sessions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_writes_on_merged_employee() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_clock_event_attendance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deactivate_old_compensation_profiles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_employee_ready_for_shift() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_pay_period_imported() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_material_shift_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invalidate_assignments_on_shift_soft_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_invoice_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_invitation_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_new_application() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_employee_on_shift_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_employees_on_shift_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_managers_on_shift_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_review_on_clockout() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_worker_profile_stage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shift_closeout_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shift_closeout_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_invitation_from_email_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_invitation_status_from_email_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_pay_period_recon_mirror() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_thread_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_shift_review_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_generate_review_requests_on_shift_complete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recompute_employee_profile_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recompute_employee_profile_status_after() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recompute_status_on_doc_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recalculate_rep_score() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_review_auto_flag() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_shift_review_to_rep_event() FROM PUBLIC, anon, authenticated;

-- profiles_safe: switch to security_invoker, preserve name/columns/grants/body
ALTER VIEW public.profiles_safe SET (security_invoker = on);
