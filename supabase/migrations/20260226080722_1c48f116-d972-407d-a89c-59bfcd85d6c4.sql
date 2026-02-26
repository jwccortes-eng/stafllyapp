
-- Fix: The employee UPDATE policy's USING clause (clock_out IS NULL) is also used as WITH CHECK by default.
-- After setting clock_out, the row fails WITH CHECK. We need an explicit WITH CHECK without that condition.

DROP POLICY "Employees can update own time_entries" ON public.time_entries;

CREATE POLICY "Employees can update own time_entries"
ON public.time_entries
FOR UPDATE
USING (
  (EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = time_entries.employee_id
      AND employees.user_id = auth.uid()
  ))
  AND clock_out IS NULL
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = time_entries.employee_id
      AND employees.user_id = auth.uid()
  )
);
