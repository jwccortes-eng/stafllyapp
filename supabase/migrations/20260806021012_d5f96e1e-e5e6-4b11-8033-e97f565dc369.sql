-- Fase 0 — endurecimiento explícito de billing_events.
-- La policy FOR ALL de owners globales no declaraba WITH CHECK; Postgres reutiliza
-- USING implícitamente, pero se hace explícito para evitar deriva futura.
-- Idempotente y sin cambio de comportamiento efectivo.
DROP POLICY IF EXISTS "Owners can manage all billing_events" ON public.billing_events;
CREATE POLICY "Owners can manage all billing_events"
ON public.billing_events
FOR ALL
USING (is_global_owner(auth.uid()))
WITH CHECK (is_global_owner(auth.uid()));