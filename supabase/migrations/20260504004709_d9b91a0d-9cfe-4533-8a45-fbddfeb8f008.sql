REVOKE SELECT ON public.profiles_safe FROM anon;

COMMENT ON VIEW public.profiles_safe IS
  'SECURITY DEFINER intencional: expone solo user_id/full_name/avatar_url para chat y Parceros marketplace. Anon revocado. profiles tabla sigue protegida por RLS estricta.';