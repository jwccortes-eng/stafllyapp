
-- ============================================================
-- FIX 1: Application documents storage bucket
-- Restrict reads to company members of the application owner
-- File path convention: {application_id}/{filename}
-- ============================================================
DROP POLICY IF EXISTS "Company members can view application docs" ON storage.objects;

CREATE POLICY "Company members can view application docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'application-documents'
  AND EXISTS (
    SELECT 1
    FROM public.job_applications ja
    WHERE ja.id::text = (storage.foldername(name))[1]
      AND (
        ja.company_id IN (SELECT public.user_company_ids(auth.uid()))
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  )
);

-- Also tighten upload policy: only allow uploads where path starts with a real application id
DROP POLICY IF EXISTS "Anyone can upload application docs" ON storage.objects;

CREATE POLICY "Public can upload application docs to valid application folder"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'application-documents'
  AND EXISTS (
    SELECT 1 FROM public.job_applications ja
    WHERE ja.id::text = (storage.foldername(name))[1]
  )
);

-- ============================================================
-- FIX 2: Flash jobs cross-company exposure
-- Restrict SELECT to members of the posting company
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view open flash jobs" ON public.flash_jobs;

CREATE POLICY "Company members can view their flash jobs"
ON public.flash_jobs
FOR SELECT
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR posted_by = auth.uid()
);

-- ============================================================
-- FIX 3: Security Definer view (companies_public)
-- Switch to security invoker so it respects caller's RLS
-- ============================================================
ALTER VIEW public.companies_public SET (security_invoker = on);

-- ============================================================
-- FIX 4: Realtime messages — restrict channel subscriptions
-- Topic naming convention used in this app: subscriptions are scoped
-- by company. We allow subscriptions only to topics that either:
--   (a) contain a company_id the user belongs to, OR
--   (b) match the user's own auth.uid() (personal notifications), OR
--   (c) are explicitly broadcast/presence topics for the user
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read own/company realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can read own/company realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow if topic contains any of the user's company ids
  EXISTS (
    SELECT 1 FROM public.user_company_ids(auth.uid()) cid
    WHERE realtime.topic() LIKE '%' || cid::text || '%'
  )
  -- Allow personal topics that include the user's auth uid
  OR realtime.topic() LIKE '%' || auth.uid()::text || '%'
  -- Allow global owners/admins
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated can write own/company realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can write own/company realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_company_ids(auth.uid()) cid
    WHERE realtime.topic() LIKE '%' || cid::text || '%'
  )
  OR realtime.topic() LIKE '%' || auth.uid()::text || '%'
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
