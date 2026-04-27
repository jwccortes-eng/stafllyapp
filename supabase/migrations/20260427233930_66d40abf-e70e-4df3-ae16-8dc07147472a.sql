-- =====================================================================
-- Client Experience Hub — Phase 1
-- Extends service_requests, adds client_contacts + threads + messages.
-- All tables strictly scoped by company_id with RLS via has_company_role.
-- =====================================================================

-- 1. Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.client_contact_portal_status AS ENUM ('invited','active','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_request_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_request_type AS ENUM (
    'staffing_request','schedule_change','cancellation','extra_workers',
    'issue_report','billing_question','general_message'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.client_thread_context AS ENUM ('client_general','service_request');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.client_message_sender AS ENUM ('admin','client','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.client_message_visibility AS ENUM ('client_visible','internal_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. client_contacts ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  title text,
  is_primary boolean NOT NULL DEFAULT false,
  portal_status public.client_contact_portal_status NOT NULL DEFAULT 'invited',
  last_login_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_client_contacts_company ON public.client_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON public.client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_email ON public.client_contacts(lower(email)) WHERE email IS NOT NULL;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_contacts_company_select" ON public.client_contacts
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "client_contacts_admin_insert" ON public.client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

CREATE POLICY "client_contacts_admin_update" ON public.client_contacts
  FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

CREATE POLICY "client_contacts_admin_delete" ON public.client_contacts
  FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

CREATE TRIGGER trg_client_contacts_updated
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Extend service_requests -------------------------------------------
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS requested_by_contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS request_type public.service_request_type NOT NULL DEFAULT 'staffing_request',
  ADD COLUMN IF NOT EXISTS priority public.service_request_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS headcount_requested integer,
  ADD COLUMN IF NOT EXISTS roles_requested jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_requests_contact ON public.service_requests(requested_by_contact_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_priority ON public.service_requests(company_id, priority);
CREATE INDEX IF NOT EXISTS idx_service_requests_type ON public.service_requests(company_id, request_type);

-- 4. client_conversation_threads ---------------------------------------
CREATE TABLE IF NOT EXISTS public.client_conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  context public.client_thread_context NOT NULL DEFAULT 'client_general',
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE CASCADE,
  subject text,
  is_open boolean NOT NULL DEFAULT true,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender public.client_message_sender,
  unread_admin_count integer NOT NULL DEFAULT 0,
  unread_client_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT thread_context_consistency CHECK (
    (context = 'service_request' AND service_request_id IS NOT NULL)
    OR (context = 'client_general' AND service_request_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_threads_company ON public.client_conversation_threads(company_id, is_open);
CREATE INDEX IF NOT EXISTS idx_threads_client ON public.client_conversation_threads(client_id);
CREATE INDEX IF NOT EXISTS idx_threads_request ON public.client_conversation_threads(service_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_thread_per_request
  ON public.client_conversation_threads(service_request_id) WHERE service_request_id IS NOT NULL;

ALTER TABLE public.client_conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_company_select" ON public.client_conversation_threads
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "threads_admin_insert" ON public.client_conversation_threads
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

CREATE POLICY "threads_admin_update" ON public.client_conversation_threads
  FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

CREATE POLICY "threads_admin_delete" ON public.client_conversation_threads
  FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

CREATE TRIGGER trg_threads_updated
  BEFORE UPDATE ON public.client_conversation_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. client_messages ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  thread_id uuid NOT NULL REFERENCES public.client_conversation_threads(id) ON DELETE CASCADE,
  sender_type public.client_message_sender NOT NULL,
  sender_user_id uuid,
  sender_contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  body text NOT NULL,
  visibility public.client_message_visibility NOT NULL DEFAULT 'client_visible',
  attachments jsonb DEFAULT '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON public.client_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_company ON public.client_messages(company_id);

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_company_select" ON public.client_messages
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "messages_admin_insert" ON public.client_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

CREATE POLICY "messages_admin_update" ON public.client_messages
  FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

CREATE POLICY "messages_admin_delete" ON public.client_messages
  FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

-- 6. Trigger: keep thread metadata in sync ------------------------------
CREATE OR REPLACE FUNCTION public.sync_thread_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_conversation_threads
     SET last_message_at = NEW.created_at,
         last_message_preview = LEFT(NEW.body, 160),
         last_message_sender = NEW.sender_type,
         unread_admin_count = CASE
           WHEN NEW.sender_type = 'client' THEN unread_admin_count + 1
           ELSE unread_admin_count END,
         unread_client_count = CASE
           WHEN NEW.sender_type = 'admin' AND NEW.visibility = 'client_visible'
             THEN unread_client_count + 1
           ELSE unread_client_count END,
         updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_thread_on_message
  AFTER INSERT ON public.client_messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_thread_on_message();
