
-- FIX 5: notifications - remove overly broad INSERT policy and add scoped one
DROP POLICY IF EXISTS "Authenticated users can insert company notifications" ON public.notifications;
DROP POLICY IF EXISTS "Company admins managers insert notifications" ON public.notifications;

CREATE POLICY "Company admins managers insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = notifications.company_id
        AND cu.role IN ('admin', 'owner', 'manager')
    )
  )
);
