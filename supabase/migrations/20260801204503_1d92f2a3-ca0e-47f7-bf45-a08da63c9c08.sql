-- =====================================================================
-- P0.3.1 — Reparación de conductores legados sin ficha de asignación.
-- Regla: la verdad multi-driver es shift_assignments.assignment_role='driver'.
-- Sólo se INSERTA la fila que falta; jamás se sobrescribe un rol existente
-- ni se tocan horas, fichajes, asistencia o payroll.
-- =====================================================================

CREATE TABLE public.legacy_driver_backfill_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL,
  shift_ref TEXT,
  shift_date DATE,
  company_id UUID,
  employee_id UUID NOT NULL,
  outcome TEXT NOT NULL,          -- 'repaired' | 'manual_review'
  reason TEXT NOT NULL,
  assignment_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.legacy_driver_backfill_audit TO authenticated;
GRANT ALL ON public.legacy_driver_backfill_audit TO service_role;

ALTER TABLE public.legacy_driver_backfill_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read their own driver backfill audit"
ON public.legacy_driver_backfill_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = legacy_driver_backfill_audit.company_id
      AND cu.user_id = auth.uid()
  )
);

CREATE UNIQUE INDEX legacy_driver_backfill_audit_repaired_uq
  ON public.legacy_driver_backfill_audit (shift_id, employee_id)
  WHERE outcome = 'repaired';

-- ---------------------------------------------------------------------
-- 1) Clasificar: turnos con driver legado sin fila 'driver'.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _legacy_driver_cases ON COMMIT DROP AS
SELECT
  s.id            AS shift_id,
  s.shift_ref,
  s.date          AS shift_date,
  s.company_id,
  s.driver_employee_id AS employee_id,
  EXISTS (SELECT 1 FROM public.shift_assignments a
           WHERE a.shift_id = s.id AND a.employee_id = s.driver_employee_id) AS has_any_assignment,
  (SELECT e.company_id FROM public.employees e WHERE e.id = s.driver_employee_id) AS emp_company_id,
  COALESCE((SELECT e.is_active FROM public.employees e WHERE e.id = s.driver_employee_id), false) AS emp_active
FROM public.scheduled_shifts s
WHERE s.driver_employee_id IS NOT NULL
  AND s.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.shift_assignments a
    WHERE a.shift_id = s.id
      AND a.employee_id = s.driver_employee_id
      AND a.assignment_role = 'driver'
  );

-- ---------------------------------------------------------------------
-- 2) Reparar sólo lo inequívoco: no existe NINGUNA fila para esa persona
--    en ese turno y la persona pertenece a la misma empresa y está activa.
--    Se silencia el aviso al trabajador: son turnos históricos.
-- ---------------------------------------------------------------------
ALTER TABLE public.shift_assignments DISABLE TRIGGER trg_notify_on_shift_assignment;

DO $backfill$
DECLARE
  c RECORD;
  _new_id UUID;
BEGIN
  FOR c IN
    SELECT * FROM _legacy_driver_cases
    WHERE has_any_assignment = false
      AND emp_company_id IS NOT NULL
      AND emp_company_id = company_id
      AND emp_active
  LOOP
    BEGIN
      INSERT INTO public.shift_assignments
        (company_id, shift_id, employee_id, assignment_role, status, response_status, response_required)
      VALUES (c.company_id, c.shift_id, c.employee_id, 'driver', 'pending', 'pending', false)
      RETURNING id INTO _new_id;

      INSERT INTO public.legacy_driver_backfill_audit
        (shift_id, shift_ref, shift_date, company_id, employee_id, outcome, reason, assignment_id)
      VALUES (c.shift_id, c.shift_ref, c.shift_date, c.company_id, c.employee_id,
              'repaired',
              'conductor legado sin ninguna ficha de equipo: se creo la ficha de conductor (pendiente, sin aviso)',
              _new_id);
    EXCEPTION WHEN OTHERS THEN
      -- Una regla operativa lo impide (solape, cumplimiento, etc.).
      -- No se fuerza nada: queda documentado para decision humana.
      INSERT INTO public.legacy_driver_backfill_audit
        (shift_id, shift_ref, shift_date, company_id, employee_id, outcome, reason)
      VALUES (c.shift_id, c.shift_ref, c.shift_date, c.company_id, c.employee_id,
              'manual_review',
              'bloqueado por una regla operativa: ' || SQLERRM);
    END;
  END LOOP;
END
$backfill$;

ALTER TABLE public.shift_assignments ENABLE TRIGGER trg_notify_on_shift_assignment;

-- ---------------------------------------------------------------------
-- 3) Registrar lo ambiguo para revisión manual (nada se modifica).
-- ---------------------------------------------------------------------
INSERT INTO public.legacy_driver_backfill_audit
  (shift_id, shift_ref, shift_date, company_id, employee_id, outcome, reason)
SELECT c.shift_id, c.shift_ref, c.shift_date, c.company_id, c.employee_id,
       'manual_review',
       CASE
         WHEN c.has_any_assignment THEN 'la persona ya esta en el equipo con otro rol: cambiarlo es una decision operativa'
         WHEN c.emp_company_id IS NULL THEN 'la persona indicada como conductor ya no existe'
         WHEN c.emp_company_id <> c.company_id THEN 'la persona pertenece a otra empresa'
         ELSE 'la persona esta inactiva o archivada'
       END
FROM _legacy_driver_cases c
WHERE NOT (
  c.has_any_assignment = false
  AND c.emp_company_id IS NOT NULL
  AND c.emp_company_id = c.company_id
  AND c.emp_active
);