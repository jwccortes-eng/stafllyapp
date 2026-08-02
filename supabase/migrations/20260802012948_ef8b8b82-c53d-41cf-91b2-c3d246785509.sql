-- 1. Versionado en scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.bump_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_bump_shift_version ON public.scheduled_shifts;
CREATE TRIGGER trg_zz_bump_shift_version
BEFORE UPDATE ON public.scheduled_shifts
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 2. Auditoría de escrituras versionadas
CREATE TABLE IF NOT EXISTS public.versioned_write_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  company_id uuid NOT NULL,
  actor_id uuid,
  expected_version integer,
  actual_version integer,
  conflict_type text,
  fields_attempted text[] NOT NULL DEFAULT '{}',
  surface text,
  intent_key text,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.versioned_write_audit TO authenticated;
GRANT ALL ON public.versioned_write_audit TO service_role;

ALTER TABLE public.versioned_write_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vwc_audit_select_own_company" ON public.versioned_write_audit;
CREATE POLICY "vwc_audit_select_own_company"
ON public.versioned_write_audit FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_users cu
  WHERE cu.company_id = versioned_write_audit.company_id
    AND cu.user_id = auth.uid()
));

DROP POLICY IF EXISTS "vwc_audit_insert_own_company" ON public.versioned_write_audit;
CREATE POLICY "vwc_audit_insert_own_company"
ON public.versioned_write_audit FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_users cu
  WHERE cu.company_id = versioned_write_audit.company_id
    AND cu.user_id = auth.uid()
));

CREATE INDEX IF NOT EXISTS idx_vwc_audit_entity ON public.versioned_write_audit (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vwc_audit_company ON public.versioned_write_audit (company_id, created_at DESC);

-- 3. Escritura versionada de servicios (PATCH parcial + expected_version)
CREATE OR REPLACE FUNCTION public.versioned_update_shift(
  p_shift_id uuid,
  p_company_id uuid,
  p_patch jsonb,
  p_expected_version integer,
  p_surface text DEFAULT NULL,
  p_intent_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'title','date','start_time','end_time','slots','client_id','location_id','notes',
    'meeting_point','special_instructions','day_type','shift_admin_id',
    'transportation_required','car_capacity','transportation_notes','driver_employee_id',
    'category_id','clock_method','attendance_mode','qr_attendance_mode','meeting_time',
    'meeting_point_location_id','job_site_location_id','job_site_address','claimable'
  ];
  v_keys text[];
  v_bad text[];
  v_current public.scheduled_shifts;
  v_next public.scheduled_shifts;
  v_row public.scheduled_shifts;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid','message','Patch vacío o inválido.');
  END IF;

  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(p_patch) AS k;
  SELECT array_agg(k) INTO v_bad FROM unnest(v_keys) AS k WHERE NOT (k = ANY(v_allowed));
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Campos no editables: ' || array_to_string(v_bad, ', '));
  END IF;

  SELECT * INTO v_current
  FROM public.scheduled_shifts
  WHERE id = p_shift_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El servicio no existe o pertenece a otra empresa.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES
      ('scheduled_shifts', p_shift_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'stale_version', v_keys, p_surface, p_intent_key, 'conflict');
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_current.version,
      'updated_by', v_current.updated_by,
      'updated_at', v_current.updated_at,
      'row', to_jsonb(v_current)
    );
  END IF;

  v_next := jsonb_populate_record(v_current, p_patch);

  UPDATE public.scheduled_shifts s SET
    title = v_next.title,
    date = v_next.date,
    start_time = v_next.start_time,
    end_time = v_next.end_time,
    slots = v_next.slots,
    client_id = v_next.client_id,
    location_id = v_next.location_id,
    notes = v_next.notes,
    meeting_point = v_next.meeting_point,
    special_instructions = v_next.special_instructions,
    day_type = v_next.day_type,
    shift_admin_id = v_next.shift_admin_id,
    transportation_required = v_next.transportation_required,
    car_capacity = v_next.car_capacity,
    transportation_notes = v_next.transportation_notes,
    driver_employee_id = v_next.driver_employee_id,
    category_id = v_next.category_id,
    clock_method = v_next.clock_method,
    attendance_mode = v_next.attendance_mode,
    qr_attendance_mode = v_next.qr_attendance_mode,
    meeting_time = v_next.meeting_time,
    meeting_point_location_id = v_next.meeting_point_location_id,
    job_site_location_id = v_next.job_site_location_id,
    job_site_address = v_next.job_site_address,
    claimable = v_next.claimable
  WHERE s.id = p_shift_id
    AND s.company_id = p_company_id
    AND (p_expected_version IS NULL OR s.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES
      ('scheduled_shifts', p_shift_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'blocked', v_keys, p_surface, p_intent_key, 'denied');
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar este servicio.');
  END IF;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
  VALUES
    ('scheduled_shifts', p_shift_id, p_company_id, auth.uid(), p_expected_version, v_row.version, NULL, v_keys, p_surface, p_intent_key, 'applied');

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.versioned_update_shift(uuid, uuid, jsonb, integer, text, text) TO authenticated;