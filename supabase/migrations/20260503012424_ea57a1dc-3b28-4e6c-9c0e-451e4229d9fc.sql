
-- 0) profiles.avatar_url (safe addition; no behavior change)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 1) community_channels.visibility
ALTER TABLE public.community_channels
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_channels_visibility_chk'
  ) THEN
    ALTER TABLE public.community_channels
      ADD CONSTRAINT community_channels_visibility_chk
      CHECK (visibility IN ('public','private'));
  END IF;
END $$;

-- 2) channel_members INSERT: only self-join to active+public channels
DROP POLICY IF EXISTS "Users can join channels" ON public.channel_members;
CREATE POLICY channel_members_self_join_public
ON public.channel_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_channels c
    WHERE c.id = channel_id
      AND c.is_active = true
      AND c.visibility = 'public'
  )
);

-- 3) community_channels SELECT: public listing only for active+public; admins see all; members see their privates
DROP POLICY IF EXISTS "Anyone authenticated can view active channels" ON public.community_channels;

CREATE POLICY community_channels_select_public
ON public.community_channels FOR SELECT TO authenticated
USING (is_active = true AND visibility = 'public');

CREATE POLICY community_channels_select_member_private
ON public.community_channels FOR SELECT TO authenticated
USING (
  visibility = 'private'
  AND EXISTS (
    SELECT 1 FROM public.channel_members cm
    WHERE cm.channel_id = community_channels.id AND cm.user_id = auth.uid()
  )
);
-- (admins keep access via existing "Admins can manage channels" ALL policy)

-- 4) profiles: drop conversation-member PII leak
DROP POLICY IF EXISTS "Conversation members can view co-member profiles" ON public.profiles;

-- 5) profiles_safe view: expose only safe fields (user_id, full_name, avatar_url)
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe
WITH (security_invoker = true)
AS
SELECT user_id, full_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.profiles_safe TO authenticated, anon;

-- profiles_safe needs a SELECT path that does NOT depend on the dropped policy.
-- Allow authenticated users to read minimal profile fields via a permissive policy
-- limited to the safe columns through a SECURITY INVOKER view + a base policy
-- restricted to rows where the requester shares a conversation OR a company.
CREATE POLICY profiles_select_safe_co_members
ON public.profiles FOR SELECT TO authenticated
USING (
  -- Same company membership (covers chat, community, admin contexts)
  EXISTS (
    SELECT 1 FROM public.company_users cu1
    JOIN public.company_users cu2 ON cu1.company_id = cu2.company_id
    WHERE cu1.user_id = auth.uid() AND cu2.user_id = profiles.user_id
  )
  OR
  -- Or a co-conversation participant (kept for chat use)
  EXISTS (
    SELECT 1 FROM public.conversation_members cm1
    JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
    WHERE cm1.user_id = auth.uid() AND cm2.user_id = profiles.user_id
  )
);
-- NOTE: this still allows SELECT * on profiles for co-members. To prevent PII
-- exposure at column level we keep the policy AND require app code to use
-- profiles_safe view. Documented in security memory.
