-- Phase 2: Attendance validation layer on shift_assignments
-- Additive only. No payroll dependency. Existing RLS policies remain intact
-- (Managers can edit shift_assignments already covers UPDATE).

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS attendance_status text
    NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending','present','late','absent','excused')),
  ADD COLUMN IF NOT EXISTS attendance_validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendance_notes text;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_attendance_status
  ON public.shift_assignments (shift_id, attendance_status);

COMMENT ON COLUMN public.shift_assignments.attendance_status IS
  'Manager-validated attendance outcome. Independent of time_entries and payroll. Values: pending|present|late|absent|excused.';
COMMENT ON COLUMN public.shift_assignments.attendance_validated_by IS
  'auth.users.id of the manager/admin/founder who set attendance_status.';
COMMENT ON COLUMN public.shift_assignments.attendance_validated_at IS
  'Timestamp of last attendance validation.';