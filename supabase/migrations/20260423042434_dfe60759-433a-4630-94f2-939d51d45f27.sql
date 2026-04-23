-- ============================================================
-- FRONT DESK CRM EVOLUTION — Phase 1 (kiosk-only, no admin UI)
-- Extends office_visits with intake reason, ticket #, escalation,
-- final resolution, kiosk photo flag, and a per-company sequence.
-- ============================================================

-- 1) Intake reason enum (what the employee said when arriving)
DO $$ BEGIN
  CREATE TYPE public.front_desk_intake_reason AS ENUM (
    'update_data',
    'check_pending',
    'payment_issue',
    'documents_help',
    'portal_help',
    'leave_request',
    'leave_comment',
    'pickup_check',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Final resolution enum (how the case was actually closed)
DO $$ BEGIN
  CREATE TYPE public.front_desk_resolution AS ENUM (
    'resolved',           -- everything fixed in-kiosk
    'pending_followup',   -- needs admin follow-up
    'escalated',          -- handed off to another admin
    'cancelled'           -- employee abandoned
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Add 'escalated' to existing office_visit_status enum (needed for trigger logic)
DO $$ BEGIN
  ALTER TYPE public.office_visit_status ADD VALUE IF NOT EXISTS 'escalated';
EXCEPTION WHEN others THEN NULL; END $$;

-- 4) Per-company sequence holder (acts as a scoped MAX-style counter)
CREATE TABLE IF NOT EXISTS public.front_desk_case_sequences (
  company_id   uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_number  integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.front_desk_case_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read case sequences" ON public.front_desk_case_sequences;
CREATE POLICY "Admins read case sequences" ON public.front_desk_case_sequences
  FOR SELECT USING (public.user_is_company_admin(auth.uid(), company_id));

-- 5) Extend office_visits with the new CRM fields
ALTER TABLE public.office_visits
  ADD COLUMN IF NOT EXISTS case_number              integer,
  ADD COLUMN IF NOT EXISTS case_code                text,
  ADD COLUMN IF NOT EXISTS intake_reason            public.front_desk_intake_reason,
  ADD COLUMN IF NOT EXISTS final_resolution         public.front_desk_resolution,
  ADD COLUMN IF NOT EXISTS resolution_note          text,
  ADD COLUMN IF NOT EXISTS assigned_admin_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_from_admin_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_to_admin_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_history       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS activity_timeline        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_captured_in_kiosk  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_url_captured       text;

-- Unique case# per company (allowing nulls for legacy rows)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_office_visits_case_per_company
  ON public.office_visits(company_id, case_number)
  WHERE case_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_visits_case_code
  ON public.office_visits(case_code) WHERE case_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_visits_intake_reason
  ON public.office_visits(company_id, intake_reason, checked_in_at DESC)
  WHERE intake_reason IS NOT NULL;

-- 6) Trigger: auto-assign case_number + case_code on insert (FD-000128 format)
CREATE OR REPLACE FUNCTION public.assign_office_visit_case_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _next   integer;
  _key    bigint;
BEGIN
  IF NEW.case_number IS NOT NULL THEN
    -- Always (re)compute case_code from case_number for consistency
    NEW.case_code := 'FD-' || LPAD(NEW.case_number::text, 6, '0');
    RETURN NEW;
  END IF;

  -- Per-company advisory lock to serialize concurrent inserts
  _key := ('x' || substr(md5('fd_case:' || NEW.company_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(_key);

  INSERT INTO public.front_desk_case_sequences (company_id, last_number, updated_at)
  VALUES (NEW.company_id, 1, now())
  ON CONFLICT (company_id) DO UPDATE
    SET last_number = public.front_desk_case_sequences.last_number + 1,
        updated_at  = now()
  RETURNING last_number INTO _next;

  NEW.case_number := _next;
  NEW.case_code   := 'FD-' || LPAD(_next::text, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_office_visits_case_number ON public.office_visits;
CREATE TRIGGER trg_office_visits_case_number
  BEFORE INSERT ON public.office_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_office_visit_case_number();

-- 7) Backfill case numbers for existing rows (one company at a time, preserving order)
DO $$
DECLARE
  _co RECORD;
  _row RECORD;
  _i integer;
BEGIN
  FOR _co IN SELECT DISTINCT company_id FROM public.office_visits WHERE case_number IS NULL LOOP
    _i := COALESCE((SELECT MAX(case_number) FROM public.office_visits WHERE company_id = _co.company_id), 0);
    FOR _row IN
      SELECT id FROM public.office_visits
      WHERE company_id = _co.company_id AND case_number IS NULL
      ORDER BY checked_in_at ASC, created_at ASC
    LOOP
      _i := _i + 1;
      UPDATE public.office_visits
        SET case_number = _i,
            case_code   = 'FD-' || LPAD(_i::text, 6, '0')
      WHERE id = _row.id;
    END LOOP;
    -- Sync sequence holder so the next live insert continues from here
    INSERT INTO public.front_desk_case_sequences(company_id, last_number, updated_at)
    VALUES (_co.company_id, _i, now())
    ON CONFLICT (company_id) DO UPDATE SET last_number = GREATEST(public.front_desk_case_sequences.last_number, EXCLUDED.last_number), updated_at = now();
  END LOOP;
END $$;