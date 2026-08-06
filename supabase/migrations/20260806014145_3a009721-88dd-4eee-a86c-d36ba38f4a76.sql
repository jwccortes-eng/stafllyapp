ALTER TABLE public.payroll_consolidation_audit
  ALTER COLUMN employee_id DROP NOT NULL;

COMMENT ON COLUMN public.payroll_consolidation_audit.employee_id IS
  'Trabajador afectado. NULL cuando el registro es de alcance de periodo (por ejemplo, result = blocked_period_locked).';