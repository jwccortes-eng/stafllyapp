-- Premium address: structured JSONB field on employees.
-- Coexists with legacy text columns (address, address_line, address_city, address_state, address_zip).
-- Shape (TypeScript-mirrored): {
--   address_line1, address_line2, city, state, postal_code, country,
--   formatted_address, latitude, longitude, place_id, maps_url,
--   source: 'manual' | 'autocomplete' | 'imported' | 'legacy',
--   validation_status: 'validated' | 'incomplete' | 'manual' | 'imported' | 'legacy' | 'empty',
--   operational_zone, neighborhood, county, confidence_score, captured_at
-- }

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS address_structured JSONB;

COMMENT ON COLUMN public.employees.address_structured IS
  'Premium structured address (Mapbox/normalized). Coexists with legacy address text columns. Shape mirrored in src/lib/address/types.ts.';

-- GIN index for future queries by city/zone/state inside JSON.
CREATE INDEX IF NOT EXISTS idx_employees_address_structured_gin
  ON public.employees USING GIN (address_structured jsonb_path_ops);
