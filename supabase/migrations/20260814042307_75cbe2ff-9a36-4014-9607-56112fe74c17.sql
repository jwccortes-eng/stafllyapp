-- Últimas policies con has_module_permission sin empresa: pasar el company_id
-- del registro padre (imports / concepts).
DO $$
DECLARE
  p record;
  parent_tbl text;
  parent_col text;
  parent_expr text;
  newq text;
  newc text;
  roles_txt text;
BEGIN
  FOR p IN
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%has_module_permission(auth.uid(), ''%'
  LOOP
    IF p.tablename = 'import_rows' THEN
      parent_expr := '(SELECT i2.company_id FROM public.imports i2 WHERE i2.id = import_rows.import_id)';
    ELSIF p.tablename = 'concept_employee_rates' THEN
      parent_expr := '(SELECT c2.company_id FROM public.concepts c2 WHERE c2.id = concept_employee_rates.concept_id)';
    ELSE
      RAISE NOTICE 'SKIP %.%', p.tablename, p.policyname;
      CONTINUE;
    END IF;

    newq := replace(coalesce(p.qual,''), 'has_module_permission(auth.uid(), ',
                    'has_module_permission(auth.uid(), ' || parent_expr || ', ');
    newc := replace(coalesce(p.with_check,''), 'has_module_permission(auth.uid(), ',
                    'has_module_permission(auth.uid(), ' || parent_expr || ', ');
    roles_txt := array_to_string(p.roles, ', ');

    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
      p.policyname, p.tablename,
      CASE WHEN p.permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      p.cmd, roles_txt,
      CASE WHEN p.qual IS NULL THEN '' ELSE 'USING (' || newq || ')' END,
      CASE WHEN p.with_check IS NULL THEN '' ELSE 'WITH CHECK (' || newc || ')' END);
  END LOOP;
END $$;