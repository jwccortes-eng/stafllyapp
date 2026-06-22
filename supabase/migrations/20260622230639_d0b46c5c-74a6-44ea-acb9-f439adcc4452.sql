-- Sprint S7-J — Fixture APPLY (Stafly Demo only). Temporary; restored in next migration.
-- Fixture A: employee …0013 → access_pin_hash = NULL
-- Fixture B: employee …0014 → access_pin_hash = corrupt bcrypt-shaped sentinel
-- access_pin, pin_set_at, pin_hash_version untouched. Real tenants untouched.

UPDATE public.employees
SET access_pin_hash = NULL
WHERE id = 'd3500000-0000-4000-8000-000000000013'
  AND company_id = 'd3500000-0000-4000-8000-000000000001';

UPDATE public.employees
SET access_pin_hash = '$2a$10$S7JfixtureBcorruptedHashSENTINELxxxxxxxxxxxxxxxxxxxxxx'
WHERE id = 'd3500000-0000-4000-8000-000000000014'
  AND company_id = 'd3500000-0000-4000-8000-000000000001';