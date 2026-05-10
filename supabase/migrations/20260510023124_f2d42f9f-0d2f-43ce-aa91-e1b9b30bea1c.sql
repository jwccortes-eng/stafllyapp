
-- ============================================================
-- Phase 8A — worker_client_preferences (additive, admin-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.worker_client_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id uuid NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  preference_type text NOT NULL CHECK (preference_type IN (
    'preferred','prequalified','blocked','not_recommended','captain_preferred','driver_preferred'
  )),
  reason text NULL,
  notes text NULL,
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CONSTRAINT wcp_target_required CHECK (client_id IS NOT NULL OR location_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_wcp_company_employee ON public.worker_client_preferences (company_id, employee_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wcp_company_client   ON public.worker_client_preferences (company_id, client_id)   WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wcp_company_location ON public.worker_client_preferences (company_id, location_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wcp_company_type     ON public.worker_client_preferences (company_id, preference_type) WHERE archived_at IS NULL;

-- Active uniqueness — coalesce nulls so unique works across nullable target columns.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wcp_active
  ON public.worker_client_preferences (
    company_id, employee_id,
    COALESCE(client_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    preference_type
  )
  WHERE archived_at IS NULL;

-- updated_at trigger (reuse standard helper if present)
CREATE OR REPLACE FUNCTION public.tg_wcp_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wcp_touch_updated_at ON public.worker_client_preferences;
CREATE TRIGGER trg_wcp_touch_updated_at
BEFORE UPDATE ON public.worker_client_preferences
FOR EACH ROW EXECUTE FUNCTION public.tg_wcp_touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.worker_client_preferences ENABLE ROW LEVEL SECURITY;

-- Read: any user authorized to manage shifts for the company.
DROP POLICY IF EXISTS "wcp_select_managers" ON public.worker_client_preferences;
CREATE POLICY "wcp_select_managers"
ON public.worker_client_preferences
FOR SELECT
TO authenticated
USING (public.can_manage_shift_company(company_id));

-- Insert: same authorization; created_by must match auth.uid() if set.
DROP POLICY IF EXISTS "wcp_insert_managers" ON public.worker_client_preferences;
CREATE POLICY "wcp_insert_managers"
ON public.worker_client_preferences
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_shift_company(company_id)
  AND (created_by IS NULL OR created_by = auth.uid())
);

-- Update (covers archive via setting archived_at): same authorization.
DROP POLICY IF EXISTS "wcp_update_managers" ON public.worker_client_preferences;
CREATE POLICY "wcp_update_managers"
ON public.worker_client_preferences
FOR UPDATE
TO authenticated
USING (public.can_manage_shift_company(company_id))
WITH CHECK (public.can_manage_shift_company(company_id));

-- No DELETE policy — soft-archive only.

-- ============================================================
-- Phase 8B — RPCs
-- ============================================================

-- set_worker_client_preference: upsert an active preference (or revive an archived one).
CREATE OR REPLACE FUNCTION public.set_worker_client_preference(
  p_employee_id uuid,
  p_client_id uuid,
  p_location_id uuid,
  p_preference_type text,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.worker_client_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_client_company uuid;
  v_location_company uuid;
  v_existing public.worker_client_preferences;
  v_row public.worker_client_preferences;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF p_client_id IS NULL AND p_location_id IS NULL THEN
    RAISE EXCEPTION 'CLIENT_OR_LOCATION_REQUIRED';
  END IF;

  IF p_preference_type NOT IN ('preferred','prequalified','blocked','not_recommended','captain_preferred','driver_preferred') THEN
    RAISE EXCEPTION 'INVALID_PREFERENCE_TYPE';
  END IF;

  SELECT company_id INTO v_company FROM public.employees WHERE id = p_employee_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND';
  END IF;

  IF NOT public.can_manage_shift_company(v_company) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT company_id INTO v_client_company FROM public.clients WHERE id = p_client_id;
    IF v_client_company IS NULL OR v_client_company <> v_company THEN
      RAISE EXCEPTION 'CLIENT_COMPANY_MISMATCH';
    END IF;
  END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT company_id INTO v_location_company FROM public.locations WHERE id = p_location_id;
    IF v_location_company IS NULL OR v_location_company <> v_company THEN
      RAISE EXCEPTION 'LOCATION_COMPANY_MISMATCH';
    END IF;
  END IF;

  -- Find an active match (any status) on the same target/type.
  SELECT * INTO v_existing
  FROM public.worker_client_preferences
  WHERE company_id = v_company
    AND employee_id = p_employee_id
    AND COALESCE(client_id,   '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_client_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND preference_type = p_preference_type
    AND archived_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.worker_client_preferences
       SET reason = COALESCE(p_reason, reason),
           notes = COALESCE(p_notes, notes),
           updated_by = auth.uid(),
           updated_at = now()
     WHERE id = v_existing.id
     RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO public.worker_client_preferences (
    company_id, employee_id, client_id, location_id,
    preference_type, reason, notes, created_by
  ) VALUES (
    v_company, p_employee_id, p_client_id, p_location_id,
    p_preference_type, p_reason, p_notes, auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_worker_client_preference(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_worker_client_preference(uuid, uuid, uuid, text, text, text) TO authenticated;

-- archive_worker_client_preference: soft archive only.
CREATE OR REPLACE FUNCTION public.archive_worker_client_preference(
  p_preference_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.worker_client_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.worker_client_preferences;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_row FROM public.worker_client_preferences WHERE id = p_preference_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PREFERENCE_NOT_FOUND';
  END IF;

  IF NOT public.can_manage_shift_company(v_row.company_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF v_row.archived_at IS NOT NULL THEN
    RETURN v_row;
  END IF;

  UPDATE public.worker_client_preferences
     SET archived_at = now(),
         updated_by = auth.uid(),
         updated_at = now(),
         reason = COALESCE(p_reason, reason)
   WHERE id = p_preference_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_worker_client_preference(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_worker_client_preference(uuid, text) TO authenticated;
