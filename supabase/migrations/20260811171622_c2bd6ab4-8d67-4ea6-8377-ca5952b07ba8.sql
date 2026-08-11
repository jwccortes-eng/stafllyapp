CREATE OR REPLACE FUNCTION public.assign_internal_id(
  p_employee_id uuid,
  p_source text DEFAULT 'manual_admin',
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp record;
  actor uuid := auth.uid();
  historical text;
  historical_taken boolean := false;
  final_reason text;
  final_notes text := p_notes;
  new_value text;
BEGIN
  SELECT id, company_id, employer_identification, identity_status,
         merged_into_employee_id, deleted_at
    INTO emp
    FROM public.employees
   WHERE id = p_employee_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF actor IS NOT NULL AND NOT (
        public.has_company_role(actor, emp.company_id, 'owner')
     OR public.has_company_role(actor, emp.company_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign internal ids for this company'
      USING ERRCODE = '42501';
  END IF;

  IF emp.employer_identification IS NOT NULL AND emp.employer_identification <> '' THEN
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'internal_id', emp.employer_identification,
      'reason', 'already_assigned'
    );
  END IF;

  IF COALESCE(emp.identity_status, '') = 'merged'
     OR emp.merged_into_employee_id IS NOT NULL
     OR emp.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'merged_or_deleted');
  END IF;

  SELECT d.employer_identification INTO historical
    FROM public.employees d
   WHERE d.company_id = emp.company_id
     AND d.id <> emp.id
     AND d.merged_into_employee_id = emp.id
     AND COALESCE(d.employer_identification, '') <> ''
   ORDER BY d.created_at ASC
   LIMIT 1;

  IF historical IS NOT NULL THEN
    -- Merged records keep their number: never take it away from them.
    SELECT EXISTS (
      SELECT 1 FROM public.employees
       WHERE company_id = emp.company_id
         AND id <> emp.id
         AND employer_identification = historical
    ) INTO historical_taken;
  END IF;

  IF historical IS NOT NULL AND NOT historical_taken THEN
    new_value := historical;
    final_reason := 'historical_preservation';
  ELSE
    new_value := public.next_internal_id(emp.company_id);
    final_reason := COALESCE(p_reason, 'new_employee');
    IF historical IS NOT NULL THEN
      final_notes := COALESCE(final_notes || ' · ', '')
        || 'historical id ' || historical || ' retained by a merged record; '
        || 'use correct_internal_id() if payroll requires reassigning it';
    END IF;
  END IF;

  PERFORM set_config('app.internal_id_writer', 'canonical', true);
  UPDATE public.employees
     SET employer_identification = new_value,
         updated_at = now()
   WHERE id = emp.id;
  PERFORM set_config('app.internal_id_writer', '', true);

  INSERT INTO public.internal_id_assignments (
    employee_id, company_id, internal_id, previous_internal_id,
    assignment_reason, source, assigned_by, notes
  ) VALUES (
    emp.id, emp.company_id, new_value, NULL,
    final_reason, COALESCE(p_source, 'manual_admin'), actor, final_notes
  );

  RETURN jsonb_build_object(
    'status', 'assigned',
    'internal_id', new_value,
    'reason', final_reason,
    'historical_candidate', historical
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_internal_id(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_internal_id(uuid, text, text, text) TO authenticated, service_role;