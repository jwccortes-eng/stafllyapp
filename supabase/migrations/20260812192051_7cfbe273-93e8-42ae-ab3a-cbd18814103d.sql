-- Identity set de una persona: su ficha viva + las fichas fusionadas en ella
-- dentro del MISMO tenant. Sólo lectura, sin cruzar empresas.
CREATE OR REPLACE FUNCTION public.user_identity_employee_ids(_user_id uuid)
RETURNS TABLE (employee_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id FROM public.employees e WHERE e.user_id = _user_id
  UNION
  SELECT s.id
  FROM public.employees s
  JOIN public.employees c
    ON c.id = s.merged_into_employee_id
   AND c.company_id = s.company_id
  WHERE c.user_id = _user_id
$$;

GRANT EXECUTE ON FUNCTION public.user_identity_employee_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "Employees can view own assignments" ON public.shift_assignments;
CREATE POLICY "Employees can view own assignments"
ON public.shift_assignments
FOR SELECT
TO authenticated
USING (
  employee_id IN (SELECT public.user_identity_employee_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Employees can view assigned shifts" ON public.scheduled_shifts;
CREATE POLICY "Employees can view assigned shifts"
ON public.scheduled_shifts
FOR SELECT
TO authenticated
USING (
  publication_status = 'published'::shift_publication_status
  AND (
    EXISTS (
      SELECT 1
      FROM public.shift_assignments sa
      WHERE sa.shift_id = scheduled_shifts.id
        AND sa.employee_id IN (SELECT public.user_identity_employee_ids(auth.uid()))
        AND sa.status <> ALL (ARRAY['removed'::text, 'rejected'::text])
        AND COALESCE(sa.is_draft_reservation, false) = false
    )
    OR (
      claimable = true
      AND status = ANY (ARRAY['open'::text, 'published'::text])
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
          AND e.company_id = scheduled_shifts.company_id
          AND e.is_active = true
      )
    )
  )
);