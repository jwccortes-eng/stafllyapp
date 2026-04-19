-- Fix claimable visibility for employees: allow both 'open' and 'published'
-- Root cause (Apr 2026, Aline #0192): policy only allowed status='open' for claimable shifts,
-- but admins create published claimable shifts. Notification was sent but employees couldn't
-- read the row → invisible in Home/MyShifts/detail.

DROP POLICY IF EXISTS "Employees can view assigned shifts" ON public.scheduled_shifts;

CREATE POLICY "Employees can view assigned shifts"
ON public.scheduled_shifts
FOR SELECT
USING (
  -- Their own assignments (active only)
  EXISTS (
    SELECT 1 FROM public.shift_assignments sa
    JOIN public.employees e ON e.id = sa.employee_id
    WHERE sa.shift_id = scheduled_shifts.id
      AND e.user_id = auth.uid()
      AND sa.status NOT IN ('removed','rejected')
  )
  -- Claimable shifts in their company (open OR published, not soft-deleted)
  OR (
    scheduled_shifts.claimable = true
    AND scheduled_shifts.status IN ('open','published')
    AND scheduled_shifts.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.employees
      WHERE user_id = auth.uid()
        AND company_id = scheduled_shifts.company_id
        AND is_active = true
    )
  )
);