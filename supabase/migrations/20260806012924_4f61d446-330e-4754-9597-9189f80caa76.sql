
REVOKE ALL ON public.payroll_period_rate_snapshots FROM anon;
REVOKE ALL ON public.payroll_period_rate_snapshots FROM authenticated;
GRANT SELECT ON public.payroll_period_rate_snapshots TO authenticated;
GRANT ALL ON public.payroll_period_rate_snapshots TO service_role;
