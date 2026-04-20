-- Add a shareable, opaque token per shift for public smart-link resolution.
-- Designed as ADDITIVE so we can later evolve to per-recipient tokens
-- (a separate table) without breaking the per-shift link behavior.

-- 1. Token generator helper (32 url-safe chars from random bytes)
CREATE OR REPLACE FUNCTION public.generate_shift_link_token()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  raw_bytes bytea;
  candidate text;
BEGIN
  LOOP
    raw_bytes := extensions.gen_random_bytes(18);
    candidate := replace(replace(replace(encode(raw_bytes, 'base64'), '+', '-'), '/', '_'), '=', '');
    candidate := substring(candidate from 1 for 24);
    -- Ensure uniqueness; collisions are astronomically unlikely but defensive
    IF NOT EXISTS (SELECT 1 FROM public.scheduled_shifts WHERE shift_link_token = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

-- 2. Add nullable column (additive, no default backfill needed yet)
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS shift_link_token text;

-- 3. Unique index (partial: only enforced when token is set)
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_shifts_shift_link_token_uniq
  ON public.scheduled_shifts (shift_link_token)
  WHERE shift_link_token IS NOT NULL;

-- 4. Trigger: assign token on insert if missing (lazy backfill happens on read)
CREATE OR REPLACE FUNCTION public.assign_shift_link_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.shift_link_token IS NULL THEN
    NEW.shift_link_token := public.generate_shift_link_token();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_shift_link_token ON public.scheduled_shifts;
CREATE TRIGGER trg_assign_shift_link_token
BEFORE INSERT ON public.scheduled_shifts
FOR EACH ROW
EXECUTE FUNCTION public.assign_shift_link_token();
