
-- Rate limiting table for employee auth
CREATE TABLE public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint on phone number
CREATE UNIQUE INDEX idx_auth_rate_limits_phone ON public.auth_rate_limits (phone_number);

-- Enable RLS
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No direct client access - only edge functions with service role can access
-- No RLS policies needed since edge function uses service_role key

-- Cleanup function: remove expired lockouts older than 24h
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_rate_limits 
  WHERE locked_until < now() - interval '24 hours'
    OR (failed_attempts = 0 AND last_attempt_at < now() - interval '1 hour');
$$;
