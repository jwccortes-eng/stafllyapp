
-- Step 1: Drop old constraints
ALTER TABLE public.implementation_log DROP CONSTRAINT IF EXISTS implementation_log_priority_check;
ALTER TABLE public.implementation_log DROP CONSTRAINT IF EXISTS implementation_log_status_check;

-- Step 2: Migrate existing priority values BEFORE adding new constraint
UPDATE public.implementation_log SET priority = 
  CASE 
    WHEN priority = 'critical' THEN 'P0'
    WHEN priority = 'high' THEN 'P1'
    WHEN priority = 'medium' THEN 'P2'
    WHEN priority = 'low' THEN 'P3'
    ELSE 'P2'
  END;

-- Step 3: Migrate existing status values BEFORE adding new constraint
UPDATE public.implementation_log SET status = 
  CASE 
    WHEN status = 'in_progress' THEN 'development'
    WHEN status = 'done' THEN 'closed'
    WHEN status = 'pending' THEN 'pending'
    WHEN status = 'blocked' THEN 'blocked'
    ELSE 'pending'
  END;

-- Step 4: Add new constraints
ALTER TABLE public.implementation_log ADD CONSTRAINT implementation_log_priority_check 
  CHECK (priority IN ('P0','P1','P2','P3'));

ALTER TABLE public.implementation_log ADD CONSTRAINT implementation_log_status_check 
  CHECK (status IN ('pending','analysis','development','ready_for_validation','validated','closed','blocked'));

-- Step 5: Add new columns
ALTER TABLE public.implementation_log
  ADD COLUMN IF NOT EXISTS module text DEFAULT 'UI / UX / Operational Polish',
  ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'feature',
  ADD COLUMN IF NOT EXISTS sprint text DEFAULT 'Backlog Connecteam Parity',
  ADD COLUMN IF NOT EXISTS affected_company text DEFAULT '',
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'mejora interna',
  ADD COLUMN IF NOT EXISTS root_cause text DEFAULT '',
  ADD COLUMN IF NOT EXISTS fix_applied text DEFAULT '',
  ADD COLUMN IF NOT EXISTS validation_required text DEFAULT '',
  ADD COLUMN IF NOT EXISTS evidence text DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsible text DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_date date;

-- Step 6: Migrate category to item_type
UPDATE public.implementation_log SET item_type = 
  CASE 
    WHEN category = 'fix' THEN 'bug'
    WHEN category = 'refactor' THEN 'tech_debt'
    ELSE 'feature'
  END;
