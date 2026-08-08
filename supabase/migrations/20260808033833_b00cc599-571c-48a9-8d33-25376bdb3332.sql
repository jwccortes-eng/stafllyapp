REVOKE EXECUTE ON FUNCTION public.intake_dictionary_upsert_rule(uuid, text, text, text, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.intake_dictionary_record_usage(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.versioned_update_intake_dictionary_rule(uuid, uuid, jsonb, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intake_dictionary_upsert_rule(uuid, text, text, text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_dictionary_record_usage(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.versioned_update_intake_dictionary_rule(uuid, uuid, jsonb, integer, text, text) TO authenticated;