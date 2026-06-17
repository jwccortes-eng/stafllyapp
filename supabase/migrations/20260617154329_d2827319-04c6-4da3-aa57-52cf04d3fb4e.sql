-- Hotfix: restore the missing per-column GRANTs for employees.preferred_name.
-- Phase 1.5 column-whitelist model requires explicit per-column GRANTs because
-- authenticated/anon have no table-level SELECT on public.employees. The
-- preferred_name column was added on 2026-06-17 without these grants, breaking
-- /app/employees/:id (admin profile load) and /portal/update-center (worker
-- self-service) with: "permission denied for table employees".
-- No RLS, no data, no other columns touched.

GRANT SELECT (preferred_name) ON public.employees TO authenticated, anon;
GRANT INSERT (preferred_name), UPDATE (preferred_name) ON public.employees TO authenticated;