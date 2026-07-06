-- Sprint RLS mínimo: bloquear escalación de privilegios vía self-update en employees.
-- Fuente: security scanner finding `employees_self_update_full_row` (ERROR).

CREATE OR REPLACE FUNCTION public.enforce_employee_self_update_safe_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  -- Skip when there is no authenticated user (service_role / internal jobs) or
  -- when the actor is NOT the employee themselves.
  IF actor IS NULL OR OLD.user_id IS NULL OR actor IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Admin / manager actors bypass the whitelist. They already have their own
  -- gating via the "Managers can edit employees" / "Company admins can manage
  -- employees" policies; nothing to enforce here.
  IF user_is_company_admin(actor, OLD.company_id)
     OR is_global_owner(actor)
     OR has_role(actor, 'developer'::app_role)
     OR has_module_permission(actor, 'employees', 'edit') THEN
    RETURN NEW;
  END IF;

  -- From here on, the actor is the employee updating their OWN row and is NOT
  -- an admin. Enforce a strict deny-list of sensitive/administrative columns.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.company_id';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.user_id';
  END IF;
  IF NEW.access_pin IS DISTINCT FROM OLD.access_pin THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.access_pin';
  END IF;
  IF NEW.access_pin_hash IS DISTINCT FROM OLD.access_pin_hash THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.access_pin_hash';
  END IF;
  IF NEW.pin_hash_version IS DISTINCT FROM OLD.pin_hash_version THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.pin_hash_version';
  END IF;
  IF NEW.pin_set_at IS DISTINCT FROM OLD.pin_set_at THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.pin_set_at';
  END IF;
  IF NEW.pin_migrated_at IS DISTINCT FROM OLD.pin_migrated_at THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.pin_migrated_at';
  END IF;
  IF NEW.must_change_pin IS DISTINCT FROM OLD.must_change_pin THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.must_change_pin';
  END IF;
  IF NEW.payroll_approval_blocked IS DISTINCT FROM OLD.payroll_approval_blocked THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.payroll_approval_blocked';
  END IF;
  IF NEW.portal_access_enabled IS DISTINCT FROM OLD.portal_access_enabled THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.portal_access_enabled';
  END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.identity_status';
  END IF;
  IF NEW.requires_identity_resolution IS DISTINCT FROM OLD.requires_identity_resolution THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.requires_identity_resolution';
  END IF;
  IF NEW.worker_type IS DISTINCT FROM OLD.worker_type THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.worker_type';
  END IF;
  IF NEW.ssn_last4 IS DISTINCT FROM OLD.ssn_last4 THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.ssn_last4';
  END IF;
  IF NEW.verification_ssn_ein IS DISTINCT FROM OLD.verification_ssn_ein THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.verification_ssn_ein';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.is_active';
  END IF;
  IF NEW.employee_role IS DISTINCT FROM OLD.employee_role THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.employee_role';
  END IF;
  IF NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.onboarding_status';
  END IF;
  IF NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.onboarding_completed_at';
  END IF;
  IF NEW.profile_status IS DISTINCT FROM OLD.profile_status THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.profile_status';
  END IF;
  IF NEW.employer_identification IS DISTINCT FROM OLD.employer_identification THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.employer_identification';
  END IF;
  IF NEW.connecteam_employee_id IS DISTINCT FROM OLD.connecteam_employee_id THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.connecteam_employee_id';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.deleted_at';
  END IF;
  IF NEW.merged_into_employee_id IS DISTINCT FROM OLD.merged_into_employee_id THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.merged_into_employee_id';
  END IF;
  IF NEW.identity_resolved_employee_id IS DISTINCT FROM OLD.identity_resolved_employee_id THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.identity_resolved_employee_id';
  END IF;
  IF NEW.identity_resolved_by IS DISTINCT FROM OLD.identity_resolved_by THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.identity_resolved_by';
  END IF;
  IF NEW.identity_resolved_at IS DISTINCT FROM OLD.identity_resolved_at THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.identity_resolved_at';
  END IF;
  IF NEW.resolved_person_id IS DISTINCT FROM OLD.resolved_person_id THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.resolved_person_id';
  END IF;
  IF NEW.original_placeholder_name IS DISTINCT FROM OLD.original_placeholder_name THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.original_placeholder_name';
  END IF;
  IF NEW.identity_source IS DISTINCT FROM OLD.identity_source THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.identity_source';
  END IF;
  IF NEW.identity_notes IS DISTINCT FROM OLD.identity_notes THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.identity_notes';
  END IF;
  IF NEW.photo_reviewed_at IS DISTINCT FROM OLD.photo_reviewed_at THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.photo_reviewed_at';
  END IF;
  IF NEW.photo_reviewed_by IS DISTINCT FROM OLD.photo_reviewed_by THEN
    RAISE EXCEPTION 'Self-service update not allowed on employees.photo_reviewed_by';
  END IF;

  -- Photo review: worker may re-upload (=> 'pending') but never self-approve.
  IF NEW.photo_review_status IS DISTINCT FROM OLD.photo_review_status
     AND (NEW.photo_review_status IS DISTINCT FROM 'pending') THEN
    RAISE EXCEPTION 'Self-service can only set employees.photo_review_status to pending';
  END IF;

  -- Rejection reason: worker may clear it (=> NULL) when re-uploading, never set text.
  IF NEW.photo_rejection_reason IS DISTINCT FROM OLD.photo_rejection_reason
     AND NEW.photo_rejection_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Self-service cannot write employees.photo_rejection_reason';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_self_update_safe_columns ON public.employees;
CREATE TRIGGER trg_enforce_employee_self_update_safe_columns
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_employee_self_update_safe_columns();

COMMENT ON FUNCTION public.enforce_employee_self_update_safe_columns() IS
  'RLS hardening: blocks self-service UPDATE on sensitive employees columns (payroll_approval_blocked, portal_access_enabled, identity_*, ssn_*, company_id, access_pin*, etc). Admins/owners/developers/managers with employees.edit permission bypass. Addresses scanner finding employees_self_update_full_row.';
