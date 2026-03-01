
-- Add approval workflow columns to movements
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Add constraint for valid statuses
ALTER TABLE public.movements
  ADD CONSTRAINT movements_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'denied'));

-- Index for filtering by approval status (common query pattern)
CREATE INDEX IF NOT EXISTS idx_movements_approval_status
  ON public.movements (period_id, approval_status);

-- Update existing auto-generated movements to 'approved' (they were already paid)
-- New auto-generated ones will come in as 'pending' via code changes
