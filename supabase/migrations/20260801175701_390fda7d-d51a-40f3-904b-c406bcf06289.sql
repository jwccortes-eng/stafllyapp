-- 1. Prefijo por empresa
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS shift_ref_prefix text;

DO $$
DECLARE r record; base text; cand text; n int;
BEGIN
  FOR r IN SELECT id, name, slug FROM public.companies WHERE shift_ref_prefix IS NULL ORDER BY created_at NULLS FIRST, id LOOP
    SELECT upper(string_agg(left(w,1), '' ORDER BY ord))
      INTO base
      FROM (
        SELECT w, ord FROM unnest(regexp_split_to_array(regexp_replace(coalesce(r.name, r.slug, 'CO'), '[^a-zA-Z ]', '', 'g'), '\s+')) WITH ORDINALITY AS t(w, ord)
        WHERE length(w) > 1 AND lower(w) NOT IN ('llc','inc','corp','by','de','del','la','el','the','and','of','staff','solutions','solution')
        LIMIT 3
      ) s;
    IF base IS NULL OR length(base) < 2 THEN
      SELECT upper(string_agg(left(w,1), '' ORDER BY ord))
        INTO base
        FROM (
          SELECT w, ord FROM unnest(regexp_split_to_array(regexp_replace(coalesce(r.name, r.slug, 'CO'), '[^a-zA-Z ]', '', 'g'), '\s+')) WITH ORDINALITY AS t(w, ord)
          WHERE length(w) > 0 LIMIT 3
        ) s2;
    END IF;
    base := coalesce(nullif(left(coalesce(base,''), 3), ''), 'CO');
    IF length(base) < 2 THEN base := rpad(base, 2, 'X'); END IF;
    cand := base; n := 1;
    WHILE EXISTS (SELECT 1 FROM public.companies WHERE shift_ref_prefix = cand) LOOP
      n := n + 1;
      cand := left(base, 2) || n::text;
    END LOOP;
    UPDATE public.companies SET shift_ref_prefix = cand WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS companies_shift_ref_prefix_uniq ON public.companies (shift_ref_prefix) WHERE shift_ref_prefix IS NOT NULL;

-- 2. Contador por empresa (monotónico, nunca reutiliza)
CREATE TABLE IF NOT EXISTS public.company_shift_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_shift_counters TO authenticated;
GRANT ALL ON public.company_shift_counters TO service_role;
ALTER TABLE public.company_shift_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own company shift counter"
  ON public.company_shift_counters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = company_shift_counters.company_id AND cu.user_id = auth.uid()) OR public.is_global_owner(auth.uid()));

-- 3. Columnas de numeración visible en turnos
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS shift_number integer,
  ADD COLUMN IF NOT EXISTS shift_ref text;

-- 4. Asignador seguro ante concurrencia
CREATE OR REPLACE FUNCTION public.next_company_shift_number(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_next integer;
BEGIN
  INSERT INTO public.company_shift_counters AS c (company_id, last_number)
  VALUES (_company_id, 1)
  ON CONFLICT (company_id) DO UPDATE
    SET last_number = c.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next;
  RETURN v_next;
END $$;

CREATE OR REPLACE FUNCTION public.assign_shift_company_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prefix text;
BEGIN
  IF NEW.shift_number IS NULL THEN
    NEW.shift_number := public.next_company_shift_number(NEW.company_id);
  END IF;
  IF NEW.shift_ref IS NULL OR NEW.shift_ref = '' THEN
    SELECT shift_ref_prefix INTO v_prefix FROM public.companies WHERE id = NEW.company_id;
    NEW.shift_ref := coalesce(v_prefix, 'CO') || '-' || lpad(NEW.shift_number::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

-- 5. Backfill histórico respetando orden de creación
WITH ordered AS (
  SELECT id, company_id,
         row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
  FROM public.scheduled_shifts
  WHERE shift_number IS NULL
)
UPDATE public.scheduled_shifts s
SET shift_number = o.rn,
    shift_ref = coalesce(c.shift_ref_prefix, 'CO') || '-' || lpad(o.rn::text, 6, '0')
FROM ordered o
JOIN public.companies c ON c.id = o.company_id
WHERE s.id = o.id;

INSERT INTO public.company_shift_counters (company_id, last_number)
SELECT company_id, max(shift_number) FROM public.scheduled_shifts GROUP BY company_id
ON CONFLICT (company_id) DO UPDATE SET last_number = GREATEST(public.company_shift_counters.last_number, EXCLUDED.last_number), updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_shifts_company_number_uniq ON public.scheduled_shifts (company_id, shift_number);
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_shifts_ref_uniq ON public.scheduled_shifts (shift_ref);

DROP TRIGGER IF EXISTS trg_assign_shift_company_number ON public.scheduled_shifts;
CREATE TRIGGER trg_assign_shift_company_number
  BEFORE INSERT ON public.scheduled_shifts
  FOR EACH ROW EXECUTE FUNCTION public.assign_shift_company_number();

-- 6. Descubrimiento cross-company fail-closed (solo empresas del usuario)
CREATE OR REPLACE FUNCTION public.find_shift_across_my_companies(p_query text)
RETURNS TABLE (
  shift_id uuid,
  company_id uuid,
  company_name text,
  shift_ref text,
  shift_number integer,
  title text,
  date date,
  start_time time,
  end_time time,
  slots integer,
  status text,
  publication_status shift_publication_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT upper(btrim(coalesce(p_query, ''))) AS raw
  ), my AS (
    SELECT c.id, c.name
    FROM public.companies c
    WHERE EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.company_id = c.id AND cu.user_id = auth.uid()
    ) OR public.is_global_owner(auth.uid())
  )
  SELECT s.id, s.company_id, my.name, s.shift_ref, s.shift_number, s.title,
         s.date, s.start_time, s.end_time, s.slots, s.status, s.publication_status
  FROM public.scheduled_shifts s
  JOIN my ON my.id = s.company_id
  CROSS JOIN q
  WHERE auth.uid() IS NOT NULL
    AND length(q.raw) >= 2
    AND s.deleted_at IS NULL
    AND (
      upper(s.shift_ref) = q.raw
      OR upper(s.shift_ref) = regexp_replace(q.raw, '^#', '')
      OR (q.raw ~ '^#?[0-9]+$' AND s.shift_number = replace(q.raw, '#', '')::int)
      OR (q.raw ~ '^#?[0-9]+$' AND upper(coalesce(s.shift_code, '')) = regexp_replace(q.raw, '^#', ''))
    )
  ORDER BY s.date DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.find_shift_across_my_companies(text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_shift_across_my_companies(text) TO authenticated;