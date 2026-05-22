-- Documents Expiration Source-of-Truth v1
-- Add an optional expiration date to admin-managed employee documents.
-- Purely additive: no defaults backfilled, no constraints, no enforcement,
-- no trigger, no RLS change. Existing admin UPDATE policy already covers writes;
-- workers continue to set expiration only at INSERT time (no UPDATE for workers).

ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS expires_at date NULL;

COMMENT ON COLUMN public.employee_documents.expires_at IS
  'Optional expiration date for the document (license, insurance, certifications). '
  'Source-of-truth for expiration status. No enforcement in v1.';