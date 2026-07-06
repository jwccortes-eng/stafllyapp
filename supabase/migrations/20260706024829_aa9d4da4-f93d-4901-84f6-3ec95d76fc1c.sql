-- =====================================================================
-- Fase 2A — Document review audit trail + integrity triggers
-- =====================================================================

-- 1) Audit table
CREATE TABLE public.document_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_document_id uuid NOT NULL REFERENCES public.employee_documents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approve','reject','reopen','expiration_updated')),
  previous_status text,
  new_status text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_review_events_doc ON public.document_review_events(employee_document_id, created_at DESC);
CREATE INDEX idx_document_review_events_employee ON public.document_review_events(employee_id, created_at DESC);
CREATE INDEX idx_document_review_events_company ON public.document_review_events(company_id, created_at DESC);

-- 2) Grants (no anon; only authenticated SELECT via RLS; writes via trigger)
GRANT SELECT ON public.document_review_events TO authenticated;
GRANT ALL ON public.document_review_events TO service_role;

-- 3) RLS
ALTER TABLE public.document_review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view review events of their company"
  ON public.document_review_events
  FOR SELECT
  TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR is_company_owner(auth.uid(), company_id)
    OR user_is_company_admin(auth.uid(), company_id)
  );

-- No INSERT/UPDATE/DELETE policies => blocked for anon/authenticated.
-- Only the SECURITY DEFINER trigger below can write.

-- 4) BEFORE UPDATE integrity trigger on employee_documents
CREATE OR REPLACE FUNCTION public.enforce_employee_document_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _sentinel_cutoff date := DATE '2999-01-01';
BEGIN
  -- Immutable ownership on any update
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'employee_documents.company_id/employee_id are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    -- Force reviewer identity + timestamp; client cannot forge these.
    NEW.reviewed_by := _uid;
    NEW.reviewed_at := now();

    IF NEW.review_status = 'rejected' THEN
      IF NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '' THEN
        RAISE EXCEPTION 'rejection_reason is required when rejecting a document'
          USING ERRCODE = '23514';
      END IF;

    ELSIF NEW.review_status = 'approved' THEN
      -- Clear stale rejection reason on approval.
      NEW.rejection_reason := NULL;
      -- Block approving an expired document, unless sentinel "no expiration".
      IF NEW.expires_at IS NOT NULL
         AND NEW.expires_at < current_date
         AND NEW.expires_at < _sentinel_cutoff THEN
        RAISE EXCEPTION 'cannot approve an expired document (expires_at=%). Update the expiration or reject it.',
          NEW.expires_at
          USING ERRCODE = '23514';
      END IF;

    ELSIF NEW.review_status = 'pending' THEN
      -- Reopen: keep prior reviewer info intact? No: reset so audit shows reopener.
      NEW.rejection_reason := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_document_review ON public.employee_documents;
CREATE TRIGGER trg_enforce_employee_document_review
  BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_employee_document_review();

-- 5) AFTER UPDATE audit trigger
CREATE OR REPLACE FUNCTION public.log_employee_document_review_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
BEGIN
  IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    IF NEW.review_status = 'approved' THEN _action := 'approve';
    ELSIF NEW.review_status = 'rejected' THEN _action := 'reject';
    ELSIF NEW.review_status = 'pending' THEN _action := 'reopen';
    ELSE _action := 'reopen';
    END IF;

    INSERT INTO public.document_review_events(
      employee_document_id, company_id, employee_id,
      action, previous_status, new_status, reviewed_by, reason
    ) VALUES (
      NEW.id, NEW.company_id, NEW.employee_id,
      _action, OLD.review_status, NEW.review_status,
      NEW.reviewed_by,
      CASE WHEN _action = 'reject' THEN NEW.rejection_reason ELSE NULL END
    );

  ELSIF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    INSERT INTO public.document_review_events(
      employee_document_id, company_id, employee_id,
      action, previous_status, new_status, reviewed_by, reason
    ) VALUES (
      NEW.id, NEW.company_id, NEW.employee_id,
      'expiration_updated', OLD.review_status, NEW.review_status,
      auth.uid(),
      CASE
        WHEN OLD.expires_at IS NULL AND NEW.expires_at IS NOT NULL THEN
          'set:' || NEW.expires_at::text
        WHEN NEW.expires_at IS NULL AND OLD.expires_at IS NOT NULL THEN
          'cleared (was ' || OLD.expires_at::text || ')'
        ELSE
          'from ' || OLD.expires_at::text || ' to ' || NEW.expires_at::text
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_employee_document_review_event ON public.employee_documents;
CREATE TRIGGER trg_log_employee_document_review_event
  AFTER UPDATE ON public.employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_employee_document_review_event();

-- Revoke direct EXECUTE from clients on the trigger helpers (postgres/service_role keep it).
REVOKE EXECUTE ON FUNCTION public.enforce_employee_document_review() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_employee_document_review_event() FROM PUBLIC, anon, authenticated;