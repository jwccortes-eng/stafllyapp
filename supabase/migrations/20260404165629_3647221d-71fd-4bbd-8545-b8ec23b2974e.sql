-- Drop the old overly-restrictive INSERT policy
DROP POLICY IF EXISTS "Company admins managers insert notifications" ON public.notifications;

-- Create a broader INSERT policy: any authenticated user can insert notifications for their own companies
CREATE POLICY "Authenticated users insert notifications for their companies"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (SELECT user_company_ids(auth.uid()))
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid() AND e.company_id = notifications.company_id
  )
);