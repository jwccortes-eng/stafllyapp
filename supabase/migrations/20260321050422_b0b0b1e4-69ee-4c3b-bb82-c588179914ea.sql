
-- Add is_legacy flag to import_batches
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS is_legacy boolean NOT NULL DEFAULT false;

-- Add notes column for audit annotations
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS audit_notes text;
