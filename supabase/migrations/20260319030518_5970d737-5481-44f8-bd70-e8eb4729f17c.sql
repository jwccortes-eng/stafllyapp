
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS switch_pin TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.switch_pin IS 'Hashed 4-digit PIN for company switch confirmation. Never expose publicly.';
