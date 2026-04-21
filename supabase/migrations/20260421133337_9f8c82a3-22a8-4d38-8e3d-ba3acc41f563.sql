
-- Definitive deletion of duplicate tenant "Quality staff" (id 7cac2ea6-…)
-- Strategy: dynamically purge ALL public tables that reference companies(id),
-- then delete the company row itself. Safe because the tenant has no operational data.

DO $$
DECLARE
  _company uuid := '7cac2ea6-0c27-417c-bc5b-2970002c0381';
  _rec record;
BEGIN
  FOR _rec IN
    SELECT conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.companies'::regclass
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I = $1', _rec.tbl, _rec.col) USING _company;
  END LOOP;

  DELETE FROM public.companies WHERE id = _company;
END $$;
