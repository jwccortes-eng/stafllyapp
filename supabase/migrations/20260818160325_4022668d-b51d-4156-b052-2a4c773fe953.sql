-- P0 WORKER PORTAL MY SHIFTS — RLS performance, misma semántica.
--
-- ANTES: company_id IN (user_company_ids(uid)) AND has_module_permission(uid, company_id, 'shifts', X)
--   has_module_permission depende de company_id (columna) → se evalúa POR FILA,
--   y cada evaluación entra en permission_catalog() + has_permission().
--
-- DESPUÉS: company_id IN (SELECT user_shift_module_company_ids(uid, X))
--   Todos los argumentos son constantes en la consulta → Postgres lo ejecuta
--   como InitPlan UNA vez, y el resto es una pertenencia a conjunto.
--
-- Equivalencia exacta:
--   {c : c ∈ user_company_ids(u) ∧ has_module_permission(u,c,m,p)}
--   es, por construcción, el conjunto que devuelve la nueva función.

CREATE OR REPLACE FUNCTION public.user_module_company_ids(
  _user_id uuid,
  _module text,
  _permission text
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cid
  FROM public.user_company_ids(_user_id) AS cid
  WHERE public.has_module_permission(_user_id, cid, _module, _permission)
$$;

REVOKE ALL ON FUNCTION public.user_module_company_ids(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_module_company_ids(uuid, text, text) TO authenticated, service_role;

-- ── shift_assignments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can view shift_assignments" ON public.shift_assignments;
CREATE POLICY "Managers can view shift_assignments"
  ON public.shift_assignments FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_module_company_ids(auth.uid(), 'shifts', 'view')));

DROP POLICY IF EXISTS "Managers can edit shift_assignments" ON public.shift_assignments;
CREATE POLICY "Managers can edit shift_assignments"
  ON public.shift_assignments FOR UPDATE TO authenticated
  USING (company_id IN (SELECT public.user_module_company_ids(auth.uid(), 'shifts', 'edit')));

DROP POLICY IF EXISTS "Managers can delete shift_assignments" ON public.shift_assignments;
CREATE POLICY "Managers can delete shift_assignments"
  ON public.shift_assignments FOR DELETE TO authenticated
  USING (company_id IN (SELECT public.user_module_company_ids(auth.uid(), 'shifts', 'delete')));

-- ── scheduled_shifts ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers can view scheduled_shifts" ON public.scheduled_shifts;
CREATE POLICY "Managers can view scheduled_shifts"
  ON public.scheduled_shifts FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_module_company_ids(auth.uid(), 'shifts', 'view')));

DROP POLICY IF EXISTS "Managers can edit scheduled_shifts" ON public.scheduled_shifts;
CREATE POLICY "Managers can edit scheduled_shifts"
  ON public.scheduled_shifts FOR UPDATE TO authenticated
  USING (company_id IN (SELECT public.user_module_company_ids(auth.uid(), 'shifts', 'edit')));

DROP POLICY IF EXISTS "Managers can delete scheduled_shifts" ON public.scheduled_shifts;
CREATE POLICY "Managers can delete scheduled_shifts"
  ON public.scheduled_shifts FOR DELETE TO authenticated
  USING (company_id IN (SELECT public.user_module_company_ids(auth.uid(), 'shifts', 'delete')));

-- Índice de apoyo para la ventana operativa del portal (identidad + empresa).
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee_company
  ON public.shift_assignments (employee_id, company_id);