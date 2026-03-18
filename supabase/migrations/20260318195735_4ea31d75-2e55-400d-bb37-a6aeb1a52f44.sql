
-- parceros_event_queue: internal queue table, restrict to authenticated service-level access
CREATE POLICY "parceros_queue_admin_only" ON public.parceros_event_queue
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner'))
  );
