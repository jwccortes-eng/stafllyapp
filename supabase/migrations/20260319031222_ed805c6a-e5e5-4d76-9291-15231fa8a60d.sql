
-- 1) Location operational defaults
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS default_pay_type TEXT DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS default_clock_method TEXT DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS require_car BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_instructions TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT NULL;

-- 2) Shift assignment roles (driver, admin, lead, staff)
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS assignment_role TEXT DEFAULT 'staff';

COMMENT ON COLUMN public.shift_assignments.assignment_role IS 'Role in shift: staff, driver, shift_admin, shift_lead, backup_admin, transport_lead, check_in_admin';

-- 3) Shift notes / communication log
CREATE TABLE IF NOT EXISTS public.shift_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  note_type TEXT NOT NULL DEFAULT 'internal',
  content TEXT NOT NULL,
  linked_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.shift_notes.note_type IS 'internal, call_log, text_message, staffing, transport, client, incident';

ALTER TABLE public.shift_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage shift notes"
  ON public.shift_notes
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 4) Shift timeline / chronology
CREATE TABLE IF NOT EXISTS public.shift_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.shift_timeline.event_type IS 'shift_created, shift_edited, employee_added, employee_removed, admin_assigned, driver_assigned, transport_enabled, message_sent, call_logged, comment_added, issue_flagged, shift_started, shift_completed';

ALTER TABLE public.shift_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view shift timeline"
  ON public.shift_timeline
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 5) Index for performance
CREATE INDEX IF NOT EXISTS idx_shift_notes_shift_id ON public.shift_notes(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_timeline_shift_id ON public.shift_timeline(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_role ON public.shift_assignments(assignment_role);
CREATE INDEX IF NOT EXISTS idx_locations_client_id ON public.locations(client_id);
