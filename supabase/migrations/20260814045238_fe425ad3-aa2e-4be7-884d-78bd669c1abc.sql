-- 1) Helper semánticamente correcto: SOLO pertenencia (no autoriza nada).
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = _user_id AND cu.company_id = _company_id
  );
$function$;

-- 2) NÚCLEO DEL P0: company_users.role='admin' deja de ser autoridad.
CREATE OR REPLACE FUNCTION public.user_is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- P0 COMPANY_ADMIN BYPASS REMOVAL:
  -- la etiqueta de membresía 'admin' NO concede autoridad. Solo dueño de ESA
  -- empresa y staff de plataforma. Para pertenencia usar user_belongs_to_company.
  SELECT public.is_global_owner(_user_id)
      OR public.is_company_owner(_user_id, _company_id)
$function$;

-- 3) Gestión de turnos: permiso explícito, sin roles de compañía legacy.
CREATE OR REPLACE FUNCTION public.can_manage_shift_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_permission(auth.uid(), _company_id, 'staffing.assign')
    OR public.has_permission(auth.uid(), _company_id, 'service.edit')
  );
$function$;

-- 4) Publicación de servicio: permiso explícito.
CREATE OR REPLACE FUNCTION public.publish_shift_draft(_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _shift public.scheduled_shifts%ROWTYPE;
  _actor uuid := auth.uid();
  _missing text[] := ARRAY[]::text[];
  _assigned_count int;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _shift FROM public.scheduled_shifts WHERE id = _shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(_actor, _shift.company_id, 'service.publish') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _shift.publication_status = 'published' THEN
    RETURN jsonb_build_object('ok', true, 'already_published', true);
  END IF;

  IF _shift.shift_date IS NULL THEN _missing := _missing || 'date'; END IF;
  IF _shift.start_time IS NULL THEN _missing := _missing || 'start_time'; END IF;
  IF _shift.end_time IS NULL THEN _missing := _missing || 'end_time'; END IF;

  SELECT count(*) INTO _assigned_count
    FROM public.shift_assignments sa
   WHERE sa.shift_id = _shift_id
     AND sa.status <> 'cancelled';
  IF _assigned_count = 0 THEN _missing := _missing || 'assignments'; END IF;

  IF array_length(_missing, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'missing', to_jsonb(_missing));
  END IF;

  UPDATE public.scheduled_shifts
     SET publication_status = 'published',
         published_at = now(),
         published_by = _actor,
         updated_at = now()
   WHERE id = _shift_id;

  RETURN jsonb_build_object('ok', true, 'published', true);
END;
$function$;

-- 5) Archivos de captura de servicio: permiso de servicio.
CREATE OR REPLACE FUNCTION public.can_manage_service_intake_files(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _company_id IS NOT NULL AND _user_id IS NOT NULL AND (
    public.has_permission(_user_id, _company_id, 'service.create')
    OR public.has_permission(_user_id, _company_id, 'service.edit')
  );
$function$;

-- 6) Datos fiscales del roster: permiso de personas.
CREATE OR REPLACE FUNCTION public.admin_get_employees_with_fiscal(p_company_id uuid)
RETURNS TABLE(id uuid, first_name text, last_name text, phone_number text, email text, connecteam_employee_id text, employer_identification text, verification_ssn_ein text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_permission(auth.uid(), p_company_id, 'workers.view') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT e.id, e.first_name, e.last_name, e.phone_number, e.email,
         e.connecteam_employee_id, e.employer_identification,
         e.verification_ssn_ein
  FROM public.employees e
  WHERE e.company_id = p_company_id
    AND e.is_active = true;
END;
$function$;

-- 7) Invitaciones: de "pertenencia" a permiso explícito workers.invite.
DROP POLICY IF EXISTS "Users can view invitations for their companies" ON public.employee_invitations;
DROP POLICY IF EXISTS "Users can insert invitations for their companies" ON public.employee_invitations;
DROP POLICY IF EXISTS "Users can update invitations for their companies" ON public.employee_invitations;

CREATE POLICY "invitations_select_by_permission"
ON public.employee_invitations FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), company_id, 'workers.invite')
  OR public.has_permission(auth.uid(), company_id, 'workers.view')
);

CREATE POLICY "invitations_insert_by_permission"
ON public.employee_invitations FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), company_id, 'workers.invite'));

CREATE POLICY "invitations_update_by_permission"
ON public.employee_invitations FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), company_id, 'workers.invite'))
WITH CHECK (public.has_permission(auth.uid(), company_id, 'workers.invite'));