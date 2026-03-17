
-- Add QR attendance columns to scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS qr_attendance_mode TEXT NOT NULL DEFAULT 'disabled';

-- Add comment for documentation
COMMENT ON COLUMN public.scheduled_shifts.qr_attendance_mode IS 'disabled | optional | required_in | required_out | required_both';
COMMENT ON COLUMN public.scheduled_shifts.qr_token IS 'Unique token for QR-based attendance validation';

-- Add transportation columns if missing (parity with creation form)
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS transportation_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS car_capacity INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS transportation_notes TEXT,
  ADD COLUMN IF NOT EXISTS driver_employee_id UUID REFERENCES public.employees(id);
