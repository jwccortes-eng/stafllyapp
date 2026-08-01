DROP POLICY IF EXISTS scm_insert_admin ON public.shift_chat_messages;
CREATE POLICY scm_insert_admin ON public.shift_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'admin'
  AND sender_user_id = auth.uid()
  AND (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), shift_chat_messages.company_id)
    OR public.has_company_role(auth.uid(), shift_chat_messages.company_id, 'admin')
    OR public.has_company_role(auth.uid(), shift_chat_messages.company_id, 'manager')
  )
  AND EXISTS (
    SELECT 1 FROM public.scheduled_shifts s
     WHERE s.id = shift_chat_messages.shift_id
       AND s.company_id = shift_chat_messages.company_id
  )
);