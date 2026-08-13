CREATE OR REPLACE FUNCTION public.admin_set_user_access(
  _user_id uuid,
  _company_id uuid,
  _actions jsonb DEFAULT '{}'::jsonb,
  _modules jsonb DEFAULT '{}'::jsonb,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _before jsonb; _after jsonb; k text; v jsonb;
BEGIN
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_required'; END IF;
  IF NOT public.user_is_company_admin(auth.uid(), _company_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_users WHERE user_id=_user_id AND company_id=_company_id) THEN
    RAISE EXCEPTION 'target_not_member_of_company';
  END IF;

  SELECT jsonb_build_object(
    'actions', COALESCE((SELECT jsonb_object_agg(action,granted) FROM public.action_permissions
                          WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'modules', COALESCE((SELECT jsonb_object_agg(module, jsonb_build_object('view',can_view,'edit',can_edit,'delete',can_delete))
                           FROM public.module_permissions WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb)
  ) INTO _before;

  FOR k, v IN SELECT * FROM jsonb_each(COALESCE(_actions,'{}'::jsonb)) LOOP
    INSERT INTO public.action_permissions (user_id, company_id, action, granted)
    VALUES (_user_id,_company_id,k,(v#>>'{}')::boolean)
    ON CONFLICT (user_id, company_id, action)
      DO UPDATE SET granted = EXCLUDED.granted, updated_at = now();
  END LOOP;

  FOR k, v IN SELECT * FROM jsonb_each(COALESCE(_modules,'{}'::jsonb)) LOOP
    INSERT INTO public.module_permissions (user_id, company_id, module, can_view, can_edit, can_delete)
    VALUES (_user_id,_company_id,k,
            COALESCE((v->>'view')::boolean,false),
            COALESCE((v->>'edit')::boolean,false),
            COALESCE((v->>'delete')::boolean,false))
    ON CONFLICT (user_id, company_id, module) WHERE company_id IS NOT NULL
      DO UPDATE SET can_view=EXCLUDED.can_view, can_edit=EXCLUDED.can_edit,
                    can_delete=EXCLUDED.can_delete, updated_at=now();
  END LOOP;

  SELECT jsonb_build_object(
    'actions', COALESCE((SELECT jsonb_object_agg(action,granted) FROM public.action_permissions
                          WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'modules', COALESCE((SELECT jsonb_object_agg(module, jsonb_build_object('view',can_view,'edit',can_edit,'delete',can_delete))
                           FROM public.module_permissions WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb)
  ) INTO _after;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _company_id, 'update', 'permissions', _user_id,
          jsonb_build_object('actor',auth.uid(),'target_user',_user_id,'company_id',_company_id,
                             'before',_before,'after',_after,'reason',_reason,'at',now()));

  RETURN _after;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_access(uuid,uuid,jsonb,jsonb,text) TO authenticated, service_role;