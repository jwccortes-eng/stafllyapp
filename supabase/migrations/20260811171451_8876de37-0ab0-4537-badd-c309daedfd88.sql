CREATE OR REPLACE FUNCTION public.internal_id_numeric(p_value text, p_prefix text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN p_value ~ '^\d+$' THEN p_value::integer
    WHEN COALESCE(p_prefix,'') <> '' AND p_value LIKE p_prefix || '%'
         AND replace(p_value, p_prefix, '') ~ '^\d+$'
      THEN replace(p_value, p_prefix, '')::integer
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.next_internal_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_internal_id(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_internal_id(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_internal_id_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_internal_id_immutability() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assign_internal_id(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_internal_id(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_internal_id(uuid) TO service_role;