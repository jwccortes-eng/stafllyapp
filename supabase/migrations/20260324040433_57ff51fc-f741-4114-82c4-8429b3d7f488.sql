-- 1. Expand status check constraint to include 'superseded'
ALTER TABLE reconciliation_period_status 
DROP CONSTRAINT reconciliation_period_status_status_check;

ALTER TABLE reconciliation_period_status 
ADD CONSTRAINT reconciliation_period_status_status_check 
CHECK (status = ANY (ARRAY['importing','normalizing','matching','reviewing','approved','posted','locked','superseded']));

-- 2. Mark old duplicate Period 112 as superseded
UPDATE reconciliation_period_status 
SET status = 'superseded', 
    notes = COALESCE(notes, '') || ' [Superseded: duplicate date range, replaced by locked version]'
WHERE id = '23ecc885-a37b-486e-abb5-aab4540c19dc';

-- 3. Prevent future duplicates (one active period per company + date range)
CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_period_company_dates 
ON reconciliation_period_status (company_id, period_start, period_end)
WHERE status != 'superseded';