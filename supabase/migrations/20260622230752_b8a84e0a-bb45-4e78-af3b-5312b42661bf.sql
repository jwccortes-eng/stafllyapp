-- Sprint S7-J — Fixture RESTORE (Stafly Demo only). Reverts the previous fixture migration.
-- Original hash bytes captured pre-fixture via SELECT on 2026-06-22.
UPDATE public.employees
SET access_pin_hash = '$2a$10$AdlZolHwXSsqzmcudD0yD.PhsoLvpnBuvrzCGsu.oeEApZ4W3u2mO'
WHERE id = 'd3500000-0000-4000-8000-000000000013'
  AND company_id = 'd3500000-0000-4000-8000-000000000001';

UPDATE public.employees
SET access_pin_hash = '$2a$10$KVOgFuioQoYkXlvAxgVD4e5qf0e44Okrc97kYWvcmTH31p.HP9SPu'
WHERE id = 'd3500000-0000-4000-8000-000000000014'
  AND company_id = 'd3500000-0000-4000-8000-000000000001';