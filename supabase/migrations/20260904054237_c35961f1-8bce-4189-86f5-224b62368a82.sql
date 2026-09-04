ALTER TABLE public.suppressed_emails
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all';

ALTER TABLE public.suppressed_emails
  DROP CONSTRAINT IF EXISTS suppressed_emails_scope_check;

ALTER TABLE public.suppressed_emails
  ADD CONSTRAINT suppressed_emails_scope_check
  CHECK (scope IN ('marketing','non_essential','all'));

UPDATE public.suppressed_emails
SET scope = CASE reason
  WHEN 'unsubscribe' THEN 'marketing'
  WHEN 'complaint' THEN 'non_essential'
  ELSE 'all'
END;

CREATE INDEX IF NOT EXISTS suppressed_emails_email_scope_idx
  ON public.suppressed_emails (email, scope);