
-- Drop old constraint that only allows 1 review per shift per reviewer
ALTER TABLE shift_reviews DROP CONSTRAINT shift_reviews_shift_id_reviewer_type_reviewer_id_key;

-- Add new constraint: 1 review per shift per reviewer per employee
ALTER TABLE shift_reviews ADD CONSTRAINT shift_reviews_shift_reviewer_employee_key 
  UNIQUE (shift_id, reviewer_type, reviewer_id, reviewed_employee_id);
