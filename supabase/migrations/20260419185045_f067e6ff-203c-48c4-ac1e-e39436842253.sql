-- 1) BACKFILL: clean orphan assignments pointing to soft-deleted shifts
UPDATE shift_assignments sa
SET status = 'removed',
    response_status = 'rejected',
    response_required = false
FROM scheduled_shifts ss
WHERE ss.id = sa.shift_id
  AND ss.deleted_at IS NOT NULL
  AND sa.status NOT IN ('removed','rejected');

-- 2) BACKFILL: mark notifications about deleted shifts as read so badges stop inflating
UPDATE notifications n
SET read_at = COALESCE(n.read_at, now())
FROM scheduled_shifts ss
WHERE ss.deleted_at IS NOT NULL
  AND n.metadata ? 'shift_id'
  AND (n.metadata->>'shift_id')::uuid = ss.id
  AND n.type IN ('shift_assigned','shift_updated_reaccept','shift_claimable','shift_time_changed','shift_date_changed','shift_location_changed')
  AND n.read_at IS NULL;

-- 3) PREVENTION: trigger to auto-invalidate assignments when a shift is soft-deleted.
-- This guarantees no future orphan assignments can leak into the worker portal.
CREATE OR REPLACE FUNCTION public.invalidate_assignments_on_shift_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire only when transitioning from "alive" to "soft-deleted"
  IF (OLD.deleted_at IS NULL) AND (NEW.deleted_at IS NOT NULL) THEN
    UPDATE shift_assignments
    SET status = 'removed',
        response_status = 'rejected',
        response_required = false
    WHERE shift_id = NEW.id
      AND status NOT IN ('removed','rejected');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_assignments_on_shift_soft_delete ON scheduled_shifts;
CREATE TRIGGER trg_invalidate_assignments_on_shift_soft_delete
AFTER UPDATE OF deleted_at ON scheduled_shifts
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_assignments_on_shift_soft_delete();