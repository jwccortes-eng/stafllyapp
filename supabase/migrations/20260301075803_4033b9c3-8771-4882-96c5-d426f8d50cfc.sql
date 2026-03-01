
-- Fix: Replace overly permissive ALL policy with specific operations
DROP POLICY "Admins can manage shift chat config" ON public.shift_chat_config;

CREATE POLICY "Admins can insert shift chat config"
ON public.shift_chat_config FOR INSERT
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update shift chat config"
ON public.shift_chat_config FOR UPDATE
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin')
);

-- Fix: Restrict admin insert on messages to actual admins
DROP POLICY "Admins can send shift chat messages" ON public.shift_chat_messages;

CREATE POLICY "Admins can send shift chat messages"
ON public.shift_chat_messages FOR INSERT
WITH CHECK (
  sender_type = 'admin' AND sender_user_id = auth.uid()
  AND company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin')
);
