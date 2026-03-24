ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employer_identification text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS verification_ssn_ein text;

WITH identity_data AS (
  SELECT DISTINCT ON (ns.matched_employee_id)
    ns.matched_employee_id AS emp_id,
    rsi.raw_data->>'Employer identification' AS eid,
    rsi.raw_data->>'Verification SSN - EIN' AS ssn
  FROM raw_schedule_import_rows rsi
  JOIN normalized_schedule_rows ns ON ns.raw_row_id = rsi.id
  WHERE ns.matched_employee_id IS NOT NULL
    AND (rsi.raw_data->>'Employer identification' IS NOT NULL OR rsi.raw_data->>'Verification SSN - EIN' IS NOT NULL)
  ORDER BY ns.matched_employee_id, rsi.created_at DESC
)
UPDATE employees e
SET 
  employer_identification = COALESCE(id_data.eid, e.employer_identification),
  verification_ssn_ein = COALESCE(id_data.ssn, e.verification_ssn_ein)
FROM identity_data id_data
WHERE e.id = id_data.emp_id
  AND (e.employer_identification IS NULL OR e.verification_ssn_ein IS NULL);