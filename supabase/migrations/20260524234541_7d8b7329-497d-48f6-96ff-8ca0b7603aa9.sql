ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS job_site_address text;

COMMENT ON COLUMN public.scheduled_shifts.job_site_address IS
  'Optional one-off job-site address (free text). Used when the job site is temporary and should NOT pollute locations_v2. Saved/reusable venues continue to use job_site_location_id / location_id.';