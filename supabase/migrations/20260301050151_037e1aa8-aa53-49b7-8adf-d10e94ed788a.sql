
-- Temporarily disable overlap triggers for data migration
ALTER TABLE shift_assignments DISABLE TRIGGER trg_prevent_overlapping_shift_assignments;
ALTER TABLE time_entries DISABLE TRIGGER trg_prevent_overlap_time_entries;
