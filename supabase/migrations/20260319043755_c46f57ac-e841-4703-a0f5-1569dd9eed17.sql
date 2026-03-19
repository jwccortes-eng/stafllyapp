
-- Step 1: Insert historical employees as inactive
INSERT INTO employees (company_id, first_name, last_name, phone_number, email, is_active, employee_role, connecteam_employee_id, created_at, updated_at)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  TRIM(SPLIT_PART(connecteam_name, ' ', 1)),
  TRIM(SUBSTRING(connecteam_name FROM POSITION(' ' IN connecteam_name) + 1)),
  connecteam_phone,
  connecteam_email,
  false,
  'historical',
  connecteam_ref,
  now(),
  now()
FROM migration_employee_mapping
WHERE company_id = '00000000-0000-0000-0000-000000000001'
  AND match_status = 'unresolved'
  AND connecteam_name IS NOT NULL
ON CONFLICT (phone_number, company_id) DO NOTHING;

-- Step 2: Link mappings to newly created employees
UPDATE migration_employee_mapping mem
SET 
  stafly_employee_id = e.id,
  match_status = 'exact_match',
  match_method = 'historical_import',
  match_confidence = 1.0,
  updated_at = now()
FROM employees e
WHERE e.company_id = '00000000-0000-0000-0000-000000000001'
  AND e.connecteam_employee_id = mem.connecteam_ref
  AND mem.company_id = '00000000-0000-0000-0000-000000000001'
  AND mem.match_status = 'unresolved';
