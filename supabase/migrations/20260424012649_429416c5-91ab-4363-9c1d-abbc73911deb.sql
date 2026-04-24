-- 1. Create audit table for temporary shift assignment overrides
CREATE TABLE IF NOT EXISTS public.shift_assignment_admin_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  CONSTRAINT shift_assignment_admin_overrides_unique UNIQUE (shift_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_saao_company ON public.shift_assignment_admin_overrides(company_id);
CREATE INDEX IF NOT EXISTS idx_saao_shift_emp ON public.shift_assignment_admin_overrides(shift_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_saao_active ON public.shift_assignment_admin_overrides(shift_id, employee_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.shift_assignment_admin_overrides ENABLE ROW LEVEL SECURITY;

-- RLS: Only admin/owner/developer of the company
CREATE POLICY "Admins can view overrides in their company"
ON public.shift_assignment_admin_overrides
FOR SELECT
USING (
  public.has_role(auth.uid(), 'developer'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.user_is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Admins can create overrides in their company"
ON public.shift_assignment_admin_overrides
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'developer'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.user_is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Admins can update overrides in their company"
ON public.shift_assignment_admin_overrides
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'developer'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.user_is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Admins can delete overrides in their company"
ON public.shift_assignment_admin_overrides
FOR DELETE
USING (
  public.has_role(auth.uid(), 'developer'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.user_is_company_admin(auth.uid(), company_id)
);

-- 2. Helper function to check if a valid override exists for a (shift, employee) pair
CREATE OR REPLACE FUNCTION public.has_active_assignment_override(_shift_id uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shift_assignment_admin_overrides
    WHERE shift_id = _shift_id
      AND employee_id = _employee_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- 3. Modify the enforce_employee_ready_for_shift trigger to honor overrides
CREATE OR REPLACE FUNCTION public.enforce_employee_ready_for_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_status public.employee_profile_status;
  _onboarding_status text;
  _employee_name text;
  _has_override boolean;
BEGIN
  -- Skip enforcement for terminal/removed assignment states
  IF NEW.status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  -- Check for an admin override first (audited bypass)
  _has_override := public.has_active_assignment_override(NEW.shift_id, NEW.employee_id);
  IF _has_override THEN
    -- Tag the assignment for downstream auditing if column exists
    BEGIN
      NEW.notes := COALESCE(NEW.notes, '') ||
        CASE WHEN NEW.notes IS NULL OR NEW.notes = '' THEN '' ELSE ' | ' END ||
        '[admin_override active]';
    EXCEPTION WHEN undefined_column THEN
      -- notes column may not exist; ignore silently
      NULL;
    END;
    RETURN NEW;
  END IF;

  -- Standard readiness gate
  SELECT profile_status, onboarding_status,
         COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
    INTO _profile_status, _onboarding_status, _employee_name
    FROM public.employees
   WHERE id = NEW.employee_id;

  IF _profile_status IS DISTINCT FROM 'ready'::public.employee_profile_status
     AND _profile_status IS DISTINCT FROM 'active'::public.employee_profile_status THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_READY: % no puede ser asignado a turnos. Estado de perfil: %, onboarding: %',
      _employee_name, _profile_status, _onboarding_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;