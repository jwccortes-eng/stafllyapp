-- Clean up duplicate movements: for each (employee_id, concept_id, period_id, company_id) group,
-- keep only the FIRST record (earliest created_at) and delete the rest.
-- This fixes the double-import issue where both "Excel Payroll" and "[Import] VERIFIED" entries exist.

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id, concept_id, period_id, company_id
      ORDER BY created_at ASC
    ) as rn
  FROM movements
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
    AND concept_id IN (
      '7b21cbef-0c1c-4e3a-baa9-836d433d5e87',
      'a3b46930-fe2e-4ce8-9f81-7b5ac3fc7197',
      '179c7ae9-3c8d-400e-b461-57ae0d16e59c',
      'ea95e7f5-d69c-4710-9e80-5560baf624cb'
    )
)
DELETE FROM movements
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);