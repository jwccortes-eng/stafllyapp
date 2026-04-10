CREATE OR REPLACE FUNCTION public.deactivate_old_compensation_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When inserting a new active profile, deactivate all other active profiles for the same employee
  IF NEW.is_active = true THEN
    UPDATE compensation_profiles
    SET is_active = false,
        effective_to = COALESCE(effective_to, NEW.effective_from)
    WHERE employee_id = NEW.employee_id
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deactivate_old_comp_profiles ON public.compensation_profiles;
CREATE TRIGGER trg_deactivate_old_comp_profiles
AFTER INSERT ON public.compensation_profiles
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_old_compensation_profiles();