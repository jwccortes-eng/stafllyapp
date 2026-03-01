
-- Re-enable overlap triggers after data migration
ALTER TABLE shift_assignments ENABLE TRIGGER trg_prevent_overlapping_shift_assignments;
ALTER TABLE time_entries ENABLE TRIGGER trg_prevent_overlap_time_entries;
