
-- Create SECURITY DEFINER function to check conversation membership without triggering RLS
CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  )
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Members can view co-members" ON public.conversation_members;

-- Recreate using the SECURITY DEFINER function
CREATE POLICY "Members can view co-members"
ON public.conversation_members
FOR SELECT
USING (public.is_conversation_member(conversation_id, auth.uid()));

-- Also fix the internal_messages policies that reference conversation_members
DROP POLICY IF EXISTS "Members can view messages" ON public.internal_messages;
CREATE POLICY "Members can view messages"
ON public.internal_messages
FOR SELECT
USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can send messages" ON public.internal_messages;
CREATE POLICY "Members can send messages"
ON public.internal_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_member(conversation_id, auth.uid())
);

-- Fix conversations policies
DROP POLICY IF EXISTS "Members can view their conversations" ON public.conversations;
CREATE POLICY "Members can view their conversations"
ON public.conversations
FOR SELECT
USING (public.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "Members can update conversations" ON public.conversations;
CREATE POLICY "Members can update conversations"
ON public.conversations
FOR UPDATE
USING (public.is_conversation_member(id, auth.uid()));

-- Fix conversation_members INSERT policy that also references itself
DROP POLICY IF EXISTS "Users can insert members to own conversations" ON public.conversation_members;
CREATE POLICY "Users can insert members to own conversations"
ON public.conversation_members
FOR INSERT
WITH CHECK (
  (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid()))
  OR public.is_conversation_member(conversation_id, auth.uid())
);

-- Fix message_reactions policy
DROP POLICY IF EXISTS "Members can view reactions" ON public.message_reactions;
CREATE POLICY "Members can view reactions"
ON public.message_reactions
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM internal_messages m
  WHERE m.id = message_reactions.message_id
    AND public.is_conversation_member(m.conversation_id, auth.uid())
));

-- Fix read_receipts if needed
DROP POLICY IF EXISTS "Users can manage own read receipts" ON public.read_receipts;
CREATE POLICY "Users can manage own read receipts"
ON public.read_receipts
FOR ALL
USING (user_id = auth.uid());
