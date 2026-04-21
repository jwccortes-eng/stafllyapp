-- Phase 3 prep: add is_default flag to billing_client_locations.
-- Decision: a single default billing location per billing_client (partial unique index).
-- This unblocks the service-block generator's "fallback billing location" logic
-- without introducing a separate operational→billing location mapping table yet.

ALTER TABLE public.billing_client_locations
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- At most one default location per billing_client (when is_default = true)
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_client_locations_default_per_client
  ON public.billing_client_locations (client_id)
  WHERE is_default = true;

-- Helpful indexes for the generator
CREATE INDEX IF NOT EXISTS idx_billing_client_locations_client
  ON public.billing_client_locations (client_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_billing_clients_operational
  ON public.billing_clients (company_id, operational_client_id)
  WHERE operational_client_id IS NOT NULL AND is_active = true;
