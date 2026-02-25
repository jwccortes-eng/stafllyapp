
-- Allow employees to view imports for periods where they have base pay data
CREATE POLICY "Employees can view own imports"
ON public.imports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.period_base_pay pbp
    JOIN public.employees e ON e.id = pbp.employee_id
    WHERE pbp.import_id = imports.id
      AND e.user_id = auth.uid()
  )
);

-- Allow employees to view import rows linked to their own employee_id
CREATE POLICY "Employees can view own import rows"
ON public.import_rows
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = import_rows.employee_id
      AND e.user_id = auth.uid()
  )
);
