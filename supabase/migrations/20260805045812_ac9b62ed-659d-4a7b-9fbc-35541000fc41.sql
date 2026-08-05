DO $migration$
DECLARE
  v_record record;
  v_definition text;
  v_current_md5 text;
  v_expected_new_md5 text;
  v_cast_count integer;
BEGIN
  -- Serialize this narrowly scoped contract repair.
  PERFORM pg_advisory_xact_lock(hashtext('p0_has_company_role_four_callers_canonical_fix'));

  -- The canonical helper contract must remain exactly the one approved.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_company_role'
      AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _company_id uuid, _role text'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef = true
      AND p.proconfig = ARRAY['search_path=public']::text[]
  ) OR (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_company_role'
  ) <> 1 THEN
    RAISE EXCEPTION 'precheck_drift: canonical has_company_role contract changed';
  END IF;

  -- Validate all four objects before replacing any body. The transaction aborts
  -- as a unit if a signature, body, owner, ACL, security mode or search_path drifted.
  FOR v_record IN
    SELECT *
    FROM (VALUES
      ('versioned_update_employee_document',
       'p_document_id uuid, p_company_id uuid, p_patch jsonb, p_expected_version integer, p_surface text, p_intent_key text',
       'edc073ecde8b4f9df72ee7867c79c70a', 'c688b184a805ec52bfd8a078c3422547', 3),
      ('review_employee_document',
       'p_document_id uuid, p_source text, p_company_id uuid, p_decision text, p_expected_version integer, p_reason text, p_surface text',
       '4f0e9880849d1356be2e8236f471bd62', 'd578874705aa00fca0d92317108a4bb2', 3),
      ('submit_contractor_w9',
       'p_company_id uuid, p_employee_id uuid, p_payload jsonb, p_expected_version integer, p_surface text, p_intent_key text',
       '00e0270c6247d03c55005c3874c9f7e2', '4f2508951e9cf928f57e38b0c17b0a80', 2),
      ('review_contractor_w9',
       'p_w9_id uuid, p_company_id uuid, p_decision text, p_expected_version integer, p_reason text, p_surface text',
       'f46c811ad499a845d4697832735bcb5e', '248fe3e66756eb036c5530a3bdef4de7', 2)
    ) AS expected(proname, identity_args, old_md5, new_md5, expected_casts)
  LOOP
    SELECT pg_get_functiondef(p.oid), md5(pg_get_functiondef(p.oid))
      INTO v_definition, v_current_md5
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_record.proname
      AND pg_get_function_identity_arguments(p.oid) = v_record.identity_args
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef = true
      AND p.proconfig = ARRAY['search_path=public']::text[]
      AND md5(COALESCE(p.proacl::text, '')) = '6f43507185d891bbb39a6636918e8fda';

    IF v_definition IS NULL THEN
      RAISE EXCEPTION 'precheck_drift: attributes, ACL or signature changed for %', v_record.proname;
    END IF;

    IF v_current_md5 NOT IN (v_record.old_md5, v_record.new_md5) THEN
      RAISE EXCEPTION 'precheck_drift: body changed for % (md5=%)', v_record.proname, v_current_md5;
    END IF;
  END LOOP;

  -- Apply only when the old body is still present. A second execution is a no-op.
  FOR v_record IN
    SELECT *
    FROM (VALUES
      ('versioned_update_employee_document',
       'p_document_id uuid, p_company_id uuid, p_patch jsonb, p_expected_version integer, p_surface text, p_intent_key text',
       'edc073ecde8b4f9df72ee7867c79c70a', 'c688b184a805ec52bfd8a078c3422547', 3),
      ('review_employee_document',
       'p_document_id uuid, p_source text, p_company_id uuid, p_decision text, p_expected_version integer, p_reason text, p_surface text',
       '4f0e9880849d1356be2e8236f471bd62', 'd578874705aa00fca0d92317108a4bb2', 3),
      ('submit_contractor_w9',
       'p_company_id uuid, p_employee_id uuid, p_payload jsonb, p_expected_version integer, p_surface text, p_intent_key text',
       '00e0270c6247d03c55005c3874c9f7e2', '4f2508951e9cf928f57e38b0c17b0a80', 2),
      ('review_contractor_w9',
       'p_w9_id uuid, p_company_id uuid, p_decision text, p_expected_version integer, p_reason text, p_surface text',
       'f46c811ad499a845d4697832735bcb5e', '248fe3e66756eb036c5530a3bdef4de7', 2)
    ) AS expected(proname, identity_args, old_md5, new_md5, expected_casts)
  LOOP
    SELECT pg_get_functiondef(p.oid)
      INTO v_definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_record.proname
      AND pg_get_function_identity_arguments(p.oid) = v_record.identity_args;

    v_current_md5 := md5(v_definition);
    IF v_current_md5 = v_record.old_md5 THEN
      v_cast_count := (length(v_definition) - length(replace(v_definition, '::app_role', ''))) / length('::app_role');
      IF v_cast_count <> v_record.expected_casts THEN
        RAISE EXCEPTION 'precheck_drift: unexpected cast count for %', v_record.proname;
      END IF;

      v_definition := replace(v_definition, '::app_role', '');
      v_expected_new_md5 := md5(v_definition);
      IF v_expected_new_md5 <> v_record.new_md5 THEN
        RAISE EXCEPTION 'precheck_drift: proposed body mismatch for %', v_record.proname;
      END IF;

      EXECUTE v_definition;
    END IF;
  END LOOP;

  -- Postcondition: exactly these four bodies are canonical and all protected
  -- attributes/ACLs remain unchanged.
  FOR v_record IN
    SELECT *
    FROM (VALUES
      ('versioned_update_employee_document',
       'p_document_id uuid, p_company_id uuid, p_patch jsonb, p_expected_version integer, p_surface text, p_intent_key text',
       'c688b184a805ec52bfd8a078c3422547'),
      ('review_employee_document',
       'p_document_id uuid, p_source text, p_company_id uuid, p_decision text, p_expected_version integer, p_reason text, p_surface text',
       'd578874705aa00fca0d92317108a4bb2'),
      ('submit_contractor_w9',
       'p_company_id uuid, p_employee_id uuid, p_payload jsonb, p_expected_version integer, p_surface text, p_intent_key text',
       '4f2508951e9cf928f57e38b0c17b0a80'),
      ('review_contractor_w9',
       'p_w9_id uuid, p_company_id uuid, p_decision text, p_expected_version integer, p_reason text, p_surface text',
       '248fe3e66756eb036c5530a3bdef4de7')
    ) AS expected(proname, identity_args, new_md5)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_record.proname
        AND pg_get_function_identity_arguments(p.oid) = v_record.identity_args
        AND md5(pg_get_functiondef(p.oid)) = v_record.new_md5
        AND pg_get_userbyid(p.proowner) = 'postgres'
        AND p.prosecdef = true
        AND p.proconfig = ARRAY['search_path=public']::text[]
        AND md5(COALESCE(p.proacl::text, '')) = '6f43507185d891bbb39a6636918e8fda'
        AND pg_get_functiondef(p.oid) NOT LIKE '%has_company_role%::app_role%'
    ) THEN
      RAISE EXCEPTION 'postcheck_failed: canonical contract or protected attributes differ for %', v_record.proname;
    END IF;
  END LOOP;
END
$migration$;