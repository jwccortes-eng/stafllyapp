
-- ============================================================
-- 1. MOVEMENTS: separación de notas + visibilidad + vínculo
-- ============================================================
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS worker_visible_note text,
  ADD COLUMN IF NOT EXISTS visible_to_worker boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pay_statement_id uuid;

COMMENT ON COLUMN public.movements.note IS 'INTERNAL ONLY. Never exposed to workers.';
COMMENT ON COLUMN public.movements.worker_visible_note IS 'Optional note explicitly written for the worker. Safe to publish.';

-- ============================================================
-- 2. PAY_STATEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pay_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pay_period_id uuid NOT NULL REFERENCES public.pay_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'external_approved'
    CHECK (source IN ('external_approved','stafly_calculated')),
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published','revoked')),
  frozen_total numeric(12,2) NOT NULL,
  frozen_base_total numeric(12,2) NOT NULL DEFAULT 0,
  frozen_extras_total numeric(12,2) NOT NULL DEFAULT 0,
  frozen_deductions_total numeric(12,2) NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  approved_at timestamptz,
  published_at timestamptz,
  published_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pay_period_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_pay_statements_employee ON public.pay_statements(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_pay_statements_period ON public.pay_statements(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_movements_statement ON public.movements(pay_statement_id);

ALTER TABLE public.movements
  DROP CONSTRAINT IF EXISTS movements_pay_statement_id_fkey;
ALTER TABLE public.movements
  ADD CONSTRAINT movements_pay_statement_id_fkey
  FOREIGN KEY (pay_statement_id) REFERENCES public.pay_statements(id) ON DELETE SET NULL;

GRANT SELECT ON public.pay_statements TO authenticated;
GRANT ALL ON public.pay_statements TO service_role;

ALTER TABLE public.pay_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view pay statements" ON public.pay_statements;
CREATE POLICY "Managers can view pay statements"
ON public.pay_statements FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_module_permission(auth.uid(), company_id, 'summary', 'view')
    OR public.has_module_permission(auth.uid(), company_id, 'periods', 'view')
  )
);

DROP POLICY IF EXISTS "Owners can manage pay statements" ON public.pay_statements;
CREATE POLICY "Owners can manage pay statements"
ON public.pay_statements FOR ALL TO authenticated
USING (public.is_global_owner(auth.uid()))
WITH CHECK (public.is_global_owner(auth.uid()));

DROP POLICY IF EXISTS "Employees can view own published statements" ON public.pay_statements;
CREATE POLICY "Employees can view own published statements"
ON public.pay_statements FOR SELECT TO authenticated
USING (
  status = 'published'
  AND published_at IS NOT NULL
  AND employee_id IN (SELECT public.user_identity_employee_ids(auth.uid()))
);

CREATE OR REPLACE FUNCTION public.pay_statements_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pay_statements_updated_at ON public.pay_statements;
CREATE TRIGGER trg_pay_statements_updated_at
BEFORE UPDATE ON public.pay_statements
FOR EACH ROW EXECUTE FUNCTION public.pay_statements_touch_updated_at();

-- ============================================================
-- 3. INMUTABILIDAD de líneas publicadas
-- ============================================================
CREATE OR REPLACE FUNCTION public.movements_block_published_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _sid uuid; _locked boolean;
BEGIN
  _sid := COALESCE(OLD.pay_statement_id, NEW.pay_statement_id);
  IF _sid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT (status = 'published') INTO _locked FROM public.pay_statements WHERE id = _sid;
  IF NOT COALESCE(_locked, false) THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Este movimiento pertenece a un recibo publicado. Despublica el recibo antes de eliminarlo.';
  END IF;

  IF NEW.total_value IS DISTINCT FROM OLD.total_value
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.rate IS DISTINCT FROM OLD.rate
     OR NEW.concept_id IS DISTINCT FROM OLD.concept_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.visible_to_worker IS DISTINCT FROM OLD.visible_to_worker THEN
    RAISE EXCEPTION 'Este movimiento pertenece a un recibo publicado. Despublica el recibo para modificarlo.';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_movements_block_published_changes ON public.movements;
CREATE TRIGGER trg_movements_block_published_changes
BEFORE UPDATE OR DELETE ON public.movements
FOR EACH ROW EXECUTE FUNCTION public.movements_block_published_changes();

-- ============================================================
-- 4. WORKER RLS: nada de lectura directa de movements
-- ============================================================
DROP POLICY IF EXISTS "Employees can view own movements" ON public.movements;

-- ============================================================
-- 5. PUBLICACIÓN (única ruta canónica)
-- ============================================================
CREATE OR REPLACE FUNCTION public.publish_pay_statement(
  _period_id uuid,
  _employee_id uuid,
  _source text DEFAULT 'external_approved'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _emp_company uuid;
  _base numeric := 0;
  _extras numeric := 0;
  _deductions numeric := 0;
  _lines integer := 0;
  _total numeric := 0;
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

  SELECT COALESCE(base_total_pay, 0) INTO _base
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

  _total := ROUND(_base + _extras - _deductions, 2);

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
      'frozen_total', _total, 'base', _base, 'extras', _extras, 'deductions', _deductions,
      'line_count', _lines, 'source', _source));

  RETURN jsonb_build_object('statement_id', _statement_id, 'frozen_total', _total,
    'base_total', _base, 'extras_total', _extras, 'deductions_total', _deductions,
    'line_count', _lines);
END; $$;

REVOKE ALL ON FUNCTION public.publish_pay_statement(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_pay_statement(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unpublish_pay_statement(_statement_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company_id uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.pay_statements WHERE id = _statement_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Recibo no encontrado'; END IF;

  IF NOT (public.is_global_owner(auth.uid())
          OR public.has_action_permission(auth.uid(), _company_id, 'aprobar_nomina')
          OR public.has_module_permission(auth.uid(), _company_id, 'periods', 'edit')) THEN
    RAISE EXCEPTION 'No tienes permiso para despublicar recibos de pago';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Debes indicar el motivo de la despublicación';
  END IF;

  UPDATE public.pay_statements
  SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = _reason
  WHERE id = _statement_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _company_id, 'pay_statement_revoked', 'pay_statement', _statement_id::text,
    jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('statement_id', _statement_id, 'status', 'revoked');
END; $$;

REVOKE ALL ON FUNCTION public.unpublish_pay_statement(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.unpublish_pay_statement(uuid, text) TO authenticated;

-- ============================================================
-- 6. LECTURA DEL TRABAJADOR (única ruta segura)
-- ============================================================
CREATE OR REPLACE FUNCTION public.worker_pay_statements()
RETURNS TABLE (
  statement_id uuid,
  company_id uuid,
  company_name text,
  period_id uuid,
  start_date date,
  end_date date,
  sequence_number integer,
  source text,
  frozen_total numeric,
  frozen_base_total numeric,
  frozen_extras_total numeric,
  frozen_deductions_total numeric,
  line_count integer,
  published_at timestamptz,
  paid_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.company_id, co.name, p.id, p.start_date, p.end_date, p.sequence_number,
         s.source, s.frozen_total, s.frozen_base_total, s.frozen_extras_total,
         s.frozen_deductions_total, s.line_count, s.published_at, p.paid_at
  FROM public.pay_statements s
  JOIN public.pay_periods p ON p.id = s.pay_period_id
  LEFT JOIN public.companies co ON co.id = s.company_id
  WHERE s.status = 'published'
    AND s.published_at IS NOT NULL
    AND s.employee_id IN (SELECT public.user_identity_employee_ids(auth.uid()))
  ORDER BY p.start_date DESC;
$$;

REVOKE ALL ON FUNCTION public.worker_pay_statements() FROM public;
GRANT EXECUTE ON FUNCTION public.worker_pay_statements() TO authenticated;

CREATE OR REPLACE FUNCTION public.worker_pay_statement_detail(_statement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.pay_statements; _p public.pay_periods; _lines jsonb;
BEGIN
  SELECT * INTO _s FROM public.pay_statements
  WHERE id = _statement_id
    AND status = 'published'
    AND published_at IS NOT NULL
    AND employee_id IN (SELECT public.user_identity_employee_ids(auth.uid()));
  IF _s.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO _p FROM public.pay_periods WHERE id = _s.pay_period_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'concept_name', c.name,
    'category', c.category::text,
    'unit_label', c.unit_label,
    'quantity', m.quantity,
    'rate', m.rate,
    'total_value', m.total_value,
    'note', m.worker_visible_note
  ) ORDER BY c.category, c.name), '[]'::jsonb)
  INTO _lines
  FROM public.movements m
  JOIN public.concepts c ON c.id = m.concept_id
  WHERE m.pay_statement_id = _s.id
    AND COALESCE(m.approval_status,'approved') = 'approved'
    AND m.visible_to_worker = true;

  RETURN jsonb_build_object(
    'statement_id', _s.id,
    'period_id', _s.pay_period_id,
    'start_date', _p.start_date,
    'end_date', _p.end_date,
    'sequence_number', _p.sequence_number,
    'source', _s.source,
    'frozen_total', _s.frozen_total,
    'frozen_base_total', _s.frozen_base_total,
    'frozen_extras_total', _s.frozen_extras_total,
    'frozen_deductions_total', _s.frozen_deductions_total,
    'published_at', _s.published_at,
    'paid_at', _p.paid_at,
    'lines', _lines
  );
END; $$;

REVOKE ALL ON FUNCTION public.worker_pay_statement_detail(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.worker_pay_statement_detail(uuid) TO authenticated;

-- Preview admin (antes de publicar), sin escrituras
CREATE OR REPLACE FUNCTION public.pay_statement_preview(_period_id uuid, _employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _company_id uuid; _base numeric; _extras numeric; _deductions numeric;
        _lines integer; _pending integer;
BEGIN
  SELECT company_id INTO _company_id FROM public.pay_periods WHERE id = _period_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'Periodo no encontrado'; END IF;

  IF NOT (public.is_global_owner(auth.uid())
          OR public.has_module_permission(auth.uid(), _company_id, 'periods', 'view')
          OR public.has_module_permission(auth.uid(), _company_id, 'summary', 'view')) THEN
    RAISE EXCEPTION 'No tienes permiso para ver esta información';
  END IF;

  SELECT COALESCE(base_total_pay,0) INTO _base FROM public.period_base_pay
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

  RETURN jsonb_build_object(
    'base_total', ROUND(_base,2),
    'extras_total', ROUND(_extras,2),
    'deductions_total', ROUND(_deductions,2),
    'projected_total', ROUND(_base + _extras - _deductions, 2),
    'line_count', _lines,
    'pending_count', _pending
  );
END; $$;

REVOKE ALL ON FUNCTION public.pay_statement_preview(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pay_statement_preview(uuid, uuid) TO authenticated;
