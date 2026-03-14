-- Allow employees to update their own avatar_url
CREATE POLICY "Employees can update own avatar"
ON public.employees FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());