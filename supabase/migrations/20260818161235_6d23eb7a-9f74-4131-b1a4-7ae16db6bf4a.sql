DO $$
DECLARE r record; new_qual text;
BEGIN
  FOR r IN
    SELECT policyname, tablename, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('SELECT','ALL')
      AND qual LIKE '%has_module_permission(auth.uid(), company_id%'
  LOOP
    new_qual := regexp_replace(
      r.qual,
      'has_module_permission\(auth\.uid\(\), company_id, ''([a-z_]+)''::text, ''([a-z_]+)''::text\)',
      '(company_id IN ( SELECT public.user_module_company_ids(auth.uid(), ''\1''::text, ''\2''::text)))',
      'g');
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, new_qual);
  END LOOP;
END $$;