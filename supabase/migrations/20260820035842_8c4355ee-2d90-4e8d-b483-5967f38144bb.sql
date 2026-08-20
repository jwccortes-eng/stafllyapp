
-- 1) PREVIEW FIDELITY --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_statement_preview(_period_id uuid, _employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _company_id uuid; _base numeric; _extras numeric; _deductions numeric;
        _lines integer; _pending integer; _computed numeric;
        _override numeric; _override_source text;
BEGIN
  SELECT company_id INTO _company_id FROM public.pay_periods WHERE id = _period_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  IF NOT (public.is_global_owner(auth.uid())
          OR public.has_module_permission(auth.uid(), _company_id, 'periods', 'view')
          OR public.has_module_permission(auth.uid(), _company_id, 'summary', 'view')) THEN
    RAISE EXCEPTION 'No tienes permiso para ver esta información';
  END IF;

  SELECT COALESCE(base_total_pay,0), approved_total_override, approved_total_source
    INTO _base, _override, _override_source
  FROM public.period_base_pay
  WHERE period_id = _period_id AND employee_id = _employee_id;
  _base := COALESCE(_base, 0);

  SELECT
    COALESCE(SUM(CASE WHEN c.category='extra' AND COALESCE(m.approval_status,'approved')='approved' AND m.visible_to_worker THEN m.total_value ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN c.category='deduction' AND COALESCE(m.approval_status,'approved')='approved' AND m.visible_to_worker THEN ABS(m.total_value) ELSE 0 END),0),
    COUNT(*) FILTER (WHERE COALESCE(m.approval_status,'approved')='approved' AND m.visible_to_worker),
    COUNT(*) FILTER (WHERE COALESCE(m.approval_status,'approved')='pending')
  INTO _extras, _deductions, _lines, _pending
  FROM public.movements m JOIN public.concepts c ON c.id = m.concept_id
  WHERE m.period_id = _period_id AND m.employee_id = _employee_id;

  _computed := ROUND(_base + _extras - _deductions, 2);

  RETURN jsonb_build_object(
    'base_total', ROUND(_base,2),
    'extras_total', ROUND(_extras,2),
    'deductions_total', ROUND(_deductions,2),
    'projected_total', _computed,
    'computed_total', _computed,
    'approved_total_override', CASE WHEN _override IS NULL THEN NULL ELSE ROUND(_override,2) END,
    'approved_total_source', _override_source,
    'frozen_total_preview', COALESCE(ROUND(_override,2), _computed),
    'has_override', (_override IS NOT NULL AND ROUND(_override,2) IS DISTINCT FROM _computed),
    'line_count', _lines,
    'pending_count', _pending
  );
END; $function$;

-- 2) BULK PREVIEW (READ ONLY) ------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_pay_statement_preview(_period_id uuid, _employee_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _company_id uuid; _rows jsonb;
BEGIN
  SELECT company_id INTO _company_id FROM public.pay_periods WHERE id = _period_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  IF NOT (public.is_global_owner(auth.uid())
          OR public.has_module_permission(auth.uid(), _company_id, 'periods', 'view')
          OR public.has_module_permission(auth.uid(), _company_id, 'summary', 'view')) THEN
    RAISE EXCEPTION 'No tienes permiso para ver esta información';
  END IF;

  WITH base AS (
    SELECT pbp.employee_id,
           COALESCE(pbp.base_total_pay,0)::numeric AS base_total,
           pbp.approved_total_override,
           pbp.approved_total_source
    FROM public.period_base_pay pbp
    WHERE pbp.period_id = _period_id
      AND (_employee_ids IS NULL OR pbp.employee_id = ANY(_employee_ids))
  ),
  mov AS (
    SELECT m.employee_id,
      COALESCE(SUM(CASE WHEN c.category='extra' AND COALESCE(m.approval_status,'approved')='approved' AND m.visible_to_worker THEN m.total_value ELSE 0 END),0) AS extras,
      COALESCE(SUM(CASE WHEN c.category='deduction' AND COALESCE(m.approval_status,'approved')='approved' AND m.visible_to_worker THEN ABS(m.total_value) ELSE 0 END),0) AS deductions,
      COUNT(*) FILTER (WHERE COALESCE(m.approval_status,'approved')='approved' AND m.visible_to_worker) AS line_count,
      COUNT(*) FILTER (WHERE COALESCE(m.approval_status,'approved')='pending') AS pending_count
    FROM public.movements m JOIN public.concepts c ON c.id = m.concept_id
    WHERE m.period_id = _period_id
      AND (_employee_ids IS NULL OR m.employee_id = ANY(_employee_ids))
    GROUP BY m.employee_id
  ),
  merged AS (
    SELECT COALESCE(b.employee_id, mv.employee_id) AS employee_id,
           COALESCE(b.base_total,0) AS base_total,
           b.approved_total_override,
           b.approved_total_source,
           COALESCE(mv.extras,0) AS extras,
           COALESCE(mv.deductions,0) AS deductions,
           COALESCE(mv.line_count,0) AS line_count,
           COALESCE(mv.pending_count,0) AS pending_count
    FROM base b FULL OUTER JOIN mov mv ON mv.employee_id = b.employee_id
  ),
  calc AS (
    SELECT m.*,
           e.company_id AS emp_company_id,
           e.employer_identification,
           TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')) AS worker_name,
           (e.user_id IS NOT NULL) AS portal_access,
           ps.id AS statement_id,
           ps.status AS statement_status,
           ps.frozen_total,
           ps.published_at,
           ROUND(m.base_total + m.extras - m.deductions, 2) AS computed_total
    FROM merged m
    LEFT JOIN public.employees e ON e.id = m.employee_id
    LEFT JOIN public.pay_statements ps
      ON ps.pay_period_id = _period_id AND ps.employee_id = m.employee_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'employee_id', c.employee_id,
    'employer_identification', c.employer_identification,
    'worker_name', NULLIF(c.worker_name,''),
    'company_id', c.emp_company_id,
    'base', ROUND(c.base_total,2),
    'extras', ROUND(c.extras,2),
    'deductions', ROUND(c.deductions,2),
    'computed_total', c.computed_total,
    'approved_total_override', CASE WHEN c.approved_total_override IS NULL THEN NULL ELSE ROUND(c.approved_total_override,2) END,
    'approved_total_source', c.approved_total_source,
    'frozen_total_preview', COALESCE(ROUND(c.approved_total_override,2), c.computed_total),
    'has_override', (c.approved_total_override IS NOT NULL AND ROUND(c.approved_total_override,2) IS DISTINCT FROM c.computed_total),
    'pending_count', c.pending_count,
    'line_count', c.line_count,
    'statement_id', c.statement_id,
    'statement_status', c.statement_status,
    'published_frozen_total', c.frozen_total,
    'published_at', c.published_at,
    'portal_access', COALESCE(c.portal_access,false),
    'readiness', CASE
      WHEN c.statement_status = 'published' THEN 'published'
      WHEN c.emp_company_id IS NULL THEN 'blocked'
      WHEN c.emp_company_id IS DISTINCT FROM _company_id THEN 'blocked'
      WHEN c.pending_count > 0 THEN 'blocked'
      WHEN COALESCE(ROUND(c.approved_total_override,2), c.computed_total) IS NULL THEN 'blocked'
      ELSE 'ready' END,
    'blocking_reason', CASE
      WHEN c.statement_status = 'published' THEN NULL
      WHEN c.emp_company_id IS NULL THEN 'Identidad inválida: la ficha del trabajador no existe'
      WHEN c.emp_company_id IS DISTINCT FROM _company_id THEN 'El trabajador no pertenece a la empresa del periodo'
      WHEN c.pending_count > 0 THEN c.pending_count || ' movimiento(s) pendiente(s) de aprobación'
      WHEN COALESCE(ROUND(c.approved_total_override,2), c.computed_total) IS NULL THEN 'Datos financieros incompletos'
      ELSE NULL END
  ) ORDER BY c.worker_name), '[]'::jsonb)
  INTO _rows FROM calc c;

  RETURN jsonb_build_object('period_id', _period_id, 'company_id', _company_id, 'rows', _rows);
END; $function$;

-- 3) BULK PUBLISH ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_publish_pay_statements(_period_id uuid, _employee_ids uuid[], _source text DEFAULT 'external_approved')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _emp uuid;
  _published jsonb := '[]'::jsonb;
  _skipped jsonb := '[]'::jsonb;
  _blocked jsonb := '[]'::jsonb;
  _failed jsonb := '[]'::jsonb;
  _published_total numeric := 0;
  _res jsonb;
  _emp_company uuid;
  _pending integer;
BEGIN
  IF _source NOT IN ('external_approved','stafly_calculated') THEN
    RAISE EXCEPTION 'Origen de statement inválido: %', _source;
  END IF;
  IF _employee_ids IS NULL OR array_length(_employee_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Debes seleccionar al menos un trabajador';
  END IF;

  SELECT company_id INTO _company_id FROM public.pay_periods WHERE id = _period_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  IF NOT (public.is_global_owner(auth.uid())
          OR public.has_action_permission(auth.uid(), _company_id, 'aprobar_nomina')
          OR public.has_module_permission(auth.uid(), _company_id, 'periods', 'edit')) THEN
    RAISE EXCEPTION 'No tienes permiso para publicar recibos de pago';
  END IF;

  FOREACH _emp IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(_employee_ids)))
  LOOP
    -- Idempotencia: nunca republicar
    IF EXISTS (SELECT 1 FROM public.pay_statements
               WHERE pay_period_id = _period_id AND employee_id = _emp AND status = 'published') THEN
      _skipped := _skipped || jsonb_build_object('employee_id', _emp, 'reason', 'already_published');
      CONTINUE;
    END IF;

    SELECT company_id INTO _emp_company FROM public.employees WHERE id = _emp;
    IF _emp_company IS NULL OR _emp_company IS DISTINCT FROM _company_id THEN
      _blocked := _blocked || jsonb_build_object('employee_id', _emp, 'reason', 'cross_tenant_or_invalid_identity');
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO _pending FROM public.movements
    WHERE period_id = _period_id AND employee_id = _emp
      AND COALESCE(approval_status,'approved') = 'pending';
    IF _pending > 0 THEN
      _blocked := _blocked || jsonb_build_object('employee_id', _emp, 'reason', 'pending_movements', 'pending_count', _pending);
      CONTINUE;
    END IF;

    BEGIN
      _res := public.publish_pay_statement(_period_id, _emp, _source);
      _published := _published || jsonb_build_object(
        'employee_id', _emp,
        'statement_id', _res->>'statement_id',
        'frozen_total', (_res->>'frozen_total')::numeric);
      _published_total := _published_total + COALESCE((_res->>'frozen_total')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed || jsonb_build_object('employee_id', _emp, 'reason', SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _company_id, 'pay_statements_bulk_published', 'pay_period', _period_id::text,
    jsonb_build_object(
      'requested', array_length(_employee_ids,1),
      'published_count', jsonb_array_length(_published),
      'published_total', ROUND(_published_total,2),
      'skipped_count', jsonb_array_length(_skipped),
      'blocked_count', jsonb_array_length(_blocked),
      'failed_count', jsonb_array_length(_failed),
      'source', _source));

  RETURN jsonb_build_object(
    'published', _published, 'skipped', _skipped, 'blocked', _blocked, 'failed', _failed,
    'published_count', jsonb_array_length(_published),
    'published_total', ROUND(_published_total,2),
    'skipped_count', jsonb_array_length(_skipped),
    'blocked_count', jsonb_array_length(_blocked),
    'failed_count', jsonb_array_length(_failed));
END; $function$;

REVOKE ALL ON FUNCTION public.bulk_pay_statement_preview(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_publish_pay_statements(uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_pay_statement_preview(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_publish_pay_statements(uuid, uuid[], text) TO authenticated;
