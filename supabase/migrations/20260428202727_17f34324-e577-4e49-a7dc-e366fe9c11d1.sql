-- Fix: add missing pay_override column to public.scheduled_shifts
-- Frontend (Shifts.tsx) writes shiftData.pay_override but column was only added
-- to legacy public.shifts table (migration 20260426150730). The active table
-- used by the operations modal is public.scheduled_shifts.
--
-- Semantics (per existing PaySection UX):
--   FALSE (default) → use base employee compensation profile (no override).
--   TRUE            → use shift-level pay_type / day_type to compute pay,
--                     but ALWAYS over real time_entries hours (never scheduled).
--
-- This is purely additive: NOT NULL with default FALSE → preserves all existing
-- rows and does not impact payroll, attendance, time_entries, shift_assignments,
-- compensation rules, RLS, or multi-tenant scoping.
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS pay_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scheduled_shifts.pay_override IS
  'When TRUE, this shift uses its own pay_type/day_type as a per-shift override. '
  'When FALSE, payroll falls back to the employee compensation profile. '
  'Override never changes the worker base profile and never replaces real hours from time_entries.';

-- Force PostgREST to reload its schema cache so the new column is visible immediately.
NOTIFY pgrst, 'reload schema';