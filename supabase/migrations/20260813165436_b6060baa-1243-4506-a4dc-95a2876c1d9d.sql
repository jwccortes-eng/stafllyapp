ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS parent_shift_id uuid NULL REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS segment_label text NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_parent
  ON public.scheduled_shifts (parent_shift_id)
  WHERE parent_shift_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_shift_segment_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.scheduled_shifts%ROWTYPE;
BEGIN
  IF NEW.parent_shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_shift_id = NEW.id THEN
    RAISE EXCEPTION 'Un servicio no puede ser su propio horario padre';
  END IF;

  SELECT * INTO parent_row FROM public.scheduled_shifts WHERE id = NEW.parent_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El servicio padre no existe';
  END IF;

  IF parent_row.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'El horario debe pertenecer a la misma empresa que el servicio';
  END IF;

  IF parent_row.parent_shift_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sólo se permite un nivel: el padre ya es un horario de otro servicio';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_shift_segment_hierarchy ON public.scheduled_shifts;
CREATE TRIGGER trg_enforce_shift_segment_hierarchy
  BEFORE INSERT OR UPDATE OF parent_shift_id ON public.scheduled_shifts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_shift_segment_hierarchy();