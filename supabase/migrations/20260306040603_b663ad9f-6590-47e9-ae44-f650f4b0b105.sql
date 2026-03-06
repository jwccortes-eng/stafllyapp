
-- Generate random 4-digit PINs for all active Quality employees without a PIN
UPDATE employees
SET access_pin = LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0'),
    updated_at = now()
WHERE company_id = '00000000-0000-0000-0000-000000000001'
  AND is_active = true
  AND (access_pin IS NULL OR access_pin = '');
