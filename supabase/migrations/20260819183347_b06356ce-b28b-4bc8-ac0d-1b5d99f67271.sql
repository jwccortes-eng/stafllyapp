ALTER TABLE public.period_base_pay
  ADD COLUMN IF NOT EXISTS approved_total_override numeric,
  ADD COLUMN IF NOT EXISTS approved_total_source text,
  ADD COLUMN IF NOT EXISTS approved_total_note text;

COMMENT ON COLUMN public.period_base_pay.approved_total_override IS 'Total final aprobado externamente (ej. TOTAL del Excel de nomina). Si esta presente, publish_pay_statement congela este valor sin recalcular.';

CREATE OR REPLACE FUNCTION public.publish_pay_statement(_period_id uuid, _employee_id uuid, _source text DEFAULT 'external_approved'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _emp_company uuid;
  _base numeric := 0;
  _extras numeric := 0;
  _deductions numeric := 0;
  _lines integer := 0;
  _total numeric := 0;
  _computed numeric := 0;
  _override numeric;
  _override_source text;
  _statement_id uuid;
BEGIN
  IF _source NOT IN ('external_approved','stafly_calculated') THEN
    RAISE EXCEPTION 'Origen de statement inválido: %', _source;
  END IF;

  SELECT company_id INTO _company_id FROM public.pay_periods WHERE id = _period_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  SELECT company_id INTO _emp_company FROM public.employees WHERE id = _employee_id;
  IF _emp_company IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'El trabajador no pertenece a la empresa del periodo';
  END IF;

  IF NOT (public.is_global_owner(auth.uid())
          OR public.has_action_permission(auth.uid(), _company_id, 'aprobar_nomina')
          OR public.has_module_permission(auth.uid(), _company_id, 'periods', 'edit')) THEN
    RAISE EXCEPTION 'No tienes permiso para publicar recibos de pago';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movements
    WHERE period_id = _period_id AND employee_id = _employee_id
      AND COALESCE(approval_status,'approved') = 'pending'
  ) THEN
    RAISE EXCEPTION 'Hay movimientos pendientes de aprobación para este trabajador. Resuélvelos antes de publicar.';
  END IF;

  SELECT COALESCE(base_total_pay, 0), approved_total_override, approved_total_source
    INTO _base, _override, _override_source
  FROM public.period_base_pay
  WHERE period_id = _period_id AND employee_id = _employee_id;
  _base := COALESCE(_base, 0);

  SELECT
    COALESCE(SUM(CASE WHEN c.category = 'extra' THEN m.total_value ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.category = 'deduction' THEN ABS(m.total_value) ELSE 0 END), 0),
    COUNT(*)
  INTO _extras, _deductions, _lines
  FROM public.movements m
  JOIN public.concepts c ON c.id = m.concept_id
  WHERE m.period_id = _period_id
    AND m.employee_id = _employee_id
    AND COALESCE(m.approval_status,'approved') = 'approved'
    AND m.visible_to_worker = true;

  _computed := ROUND(_base + _extras - _deductions, 2);
  _total := COALESCE(ROUND(_override, 2), _computed);

  INSERT INTO public.pay_statements (
    company_id, pay_period_id, employee_id, source, status,
    frozen_total, frozen_base_total, frozen_extras_total, frozen_deductions_total,
    line_count, approved_at, published_at, published_by
  ) VALUES (
    _company_id, _period_id, _employee_id, _source, 'published',
    _total, ROUND(_base,2), ROUND(_extras,2), ROUND(_deductions,2),
    _lines, now(), now(), auth.uid()
  )
  ON CONFLICT (pay_period_id, employee_id) DO UPDATE SET
    source = EXCLUDED.source,
    status = 'published',
    frozen_total = EXCLUDED.frozen_total,
    frozen_base_total = EXCLUDED.frozen_base_total,
    frozen_extras_total = EXCLUDED.frozen_extras_total,
    frozen_deductions_total = EXCLUDED.frozen_deductions_total,
    line_count = EXCLUDED.line_count,
    approved_at = COALESCE(public.pay_statements.approved_at, EXCLUDED.approved_at),
    published_at = now(),
    published_by = auth.uid(),
    revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL
  RETURNING id INTO _statement_id;

  UPDATE public.movements m
  SET pay_statement_id = _statement_id
  WHERE m.period_id = _period_id
    AND m.employee_id = _employee_id
    AND COALESCE(m.approval_status,'approved') = 'approved'
    AND m.visible_to_worker = true
    AND m.pay_statement_id IS DISTINCT FROM _statement_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _company_id, 'pay_statement_published', 'pay_statement', _statement_id::text,
    jsonb_build_object('period_id', _period_id, 'employee_id', _employee_id,
      'frozen_total', _total, 'computed_total', _computed,
      'approved_total_override', _override, 'approved_total_source', _override_source,
      'override_difference', ROUND(COALESCE(_override, _computed) - _computed, 2),
      'base', _base, 'extras', _extras, 'deductions', _deductions,
      'line_count', _lines, 'source', _source));

  RETURN jsonb_build_object('statement_id', _statement_id, 'frozen_total', _total,
    'computed_total', _computed, 'approved_total_override', _override,
    'override_difference', ROUND(COALESCE(_override, _computed) - _computed, 2),
    'base_total', _base, 'extras_total', _extras, 'deductions_total', _deductions,
    'line_count', _lines);
END; $function$;