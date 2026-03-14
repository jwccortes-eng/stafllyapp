
-- FIX 3: shift_chat_messages - verify sender owns the employee record
-- Drop the vulnerable policy
DROP POLICY IF EXISTS "Employees can send shift chat messages if assigned" ON public.shift_chat_messages;

-- Recreate with auth.uid() verification
CREATE POLICY "Employees can send shift chat messages if assigned"
ON public.shift_chat_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.shift_assignments sa
    WHERE sa.shift_id = shift_chat_messages.shift_id
      AND sa.employee_id = shift_chat_messages.sender_employee_id
      AND sa.status NOT IN ('rejected', 'removed')
  )
);
