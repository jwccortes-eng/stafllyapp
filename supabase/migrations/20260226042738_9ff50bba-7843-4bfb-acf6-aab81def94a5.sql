
-- Create notifications table for shift changes and other events
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  recipient_id UUID NOT NULL, -- employee_id or user_id depending on context
  recipient_type TEXT NOT NULL DEFAULT 'employee', -- 'employee' or 'user'
  type TEXT NOT NULL DEFAULT 'shift_change', -- shift_change, shift_published, shift_assigned, etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID -- who triggered this notification
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Employees can view their own notifications
CREATE POLICY "Employees can view own notifications"
ON public.notifications FOR SELECT
USING (
  (recipient_type = 'employee' AND EXISTS (
    SELECT 1 FROM employees WHERE id = notifications.recipient_id AND user_id = auth.uid()
  ))
  OR (recipient_type = 'user' AND recipient_id = auth.uid())
);

-- Employees can mark their notifications as read
CREATE POLICY "Employees can update own notifications"
ON public.notifications FOR UPDATE
USING (
  (recipient_type = 'employee' AND EXISTS (
    SELECT 1 FROM employees WHERE id = notifications.recipient_id AND user_id = auth.uid()
  ))
  OR (recipient_type = 'user' AND recipient_id = auth.uid())
);

-- Admins can insert notifications for their company
CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  (company_id IN (SELECT user_company_ids(auth.uid())))
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Admins can view company notifications
CREATE POLICY "Admins can view company notifications"
ON public.notifications FOR SELECT
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Owners can manage all
CREATE POLICY "Owners can manage all notifications"
ON public.notifications FOR ALL
USING (is_global_owner(auth.uid()));

-- Managers with shifts permission can insert notifications
CREATE POLICY "Managers can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_module_permission(auth.uid(), 'shifts'::text, 'edit'::text)
);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
