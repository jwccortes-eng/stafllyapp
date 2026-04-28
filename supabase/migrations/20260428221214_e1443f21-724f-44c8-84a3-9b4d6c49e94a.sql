-- Force PostgREST schema cache reload. The column `pay_override` already
-- exists in scheduled_shifts (boolean, NOT NULL, default false) but the
-- API schema cache was stale, causing:
--   "Could not find the 'pay_override' column of 'scheduled_shifts' in the schema cache"
-- We re-assert the column with IF NOT EXISTS (no-op if present) and notify
-- PostgREST to reload its schema.
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS pay_override boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';