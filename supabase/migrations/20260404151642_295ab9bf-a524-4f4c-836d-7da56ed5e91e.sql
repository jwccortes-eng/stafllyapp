
-- 1. Trigger: notify admins when a new application arrives
CREATE OR REPLACE FUNCTION public.notify_admins_new_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _admin RECORD;
  _company_name text;
BEGIN
  SELECT name INTO _company_name FROM companies WHERE id = NEW.company_id;

  FOR _admin IN
    SELECT DISTINCT cu.user_id
    FROM company_users cu
    WHERE cu.company_id = NEW.company_id
      AND cu.role IN ('admin', 'company_owner', 'owner')
  LOOP
    INSERT INTO notifications (company_id, recipient_id, recipient_type, type, title, body, metadata, created_by)
    VALUES (
      NEW.company_id,
      _admin.user_id,
      'user',
      'new_application',
      '📋 Nueva solicitud de empleo',
      COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '') || ' aplicó como ' || COALESCE(NEW.worker_type, 'empleado') || '.',
      jsonb_build_object('application_id', NEW.id, 'reference_code', NEW.reference_code),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_application
  AFTER INSERT ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_new_application();

-- 2. Trigger: notify admins when invitation is accepted
CREATE OR REPLACE FUNCTION public.notify_admins_invitation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _admin RECORD;
  _emp_name text;
BEGIN
  -- Only fire on status change
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') INTO _emp_name
  FROM employees WHERE id = NEW.employee_id;

  IF NEW.status = 'accepted' THEN
    FOR _admin IN
      SELECT DISTINCT cu.user_id FROM company_users cu
      WHERE cu.company_id = NEW.company_id AND cu.role IN ('admin', 'company_owner', 'owner')
    LOOP
      INSERT INTO notifications (company_id, recipient_id, recipient_type, type, title, body, metadata, created_by)
      VALUES (NEW.company_id, _admin.user_id, 'user', 'invitation_accepted',
        '✅ Invitación aceptada',
        _emp_name || ' aceptó su invitación y activó su portal.',
        jsonb_build_object('employee_id', NEW.employee_id, 'invitation_id', NEW.id),
        NULL);
    END LOOP;
  ELSIF NEW.status = 'expired' THEN
    FOR _admin IN
      SELECT DISTINCT cu.user_id FROM company_users cu
      WHERE cu.company_id = NEW.company_id AND cu.role IN ('admin', 'company_owner', 'owner')
    LOOP
      INSERT INTO notifications (company_id, recipient_id, recipient_type, type, title, body, metadata, created_by)
      VALUES (NEW.company_id, _admin.user_id, 'user', 'invitation_expired',
        '⏰ Invitación expirada',
        'La invitación de ' || _emp_name || ' expiró sin ser aceptada.',
        jsonb_build_object('employee_id', NEW.employee_id, 'invitation_id', NEW.id),
        NULL);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_invitation_status
  AFTER UPDATE ON public.employee_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_invitation_status();

-- 3. Function to expire old invitations (called by cron)
CREATE OR REPLACE FUNCTION public.expire_old_invitations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count int;
BEGIN
  UPDATE employee_invitations
  SET status = 'expired'
  WHERE status IN ('created', 'sent', 'opened')
    AND expires_at IS NOT NULL
    AND expires_at < now();
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
