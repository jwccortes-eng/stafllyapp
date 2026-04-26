-- Fase 1: Restaurar GRANTs faltantes en tablas core de tenancy.
-- RLS sigue siendo la única autoridad sobre qué filas se devuelven;
-- los GRANTs solo abren la puerta al motor para que evalúe las policies.

GRANT SELECT ON public.companies        TO authenticated;
GRANT SELECT ON public.company_users    TO authenticated;
GRANT SELECT ON public.user_roles       TO authenticated;
GRANT SELECT ON public.company_modules  TO authenticated;
GRANT SELECT ON public.profiles         TO authenticated;

-- Mantener INSERT/UPDATE/DELETE solo donde ya existían policies operativas;
-- no abrimos escritura nueva aquí.

-- Membership explícita del admin principal en JKitchen Staff.
INSERT INTO public.company_users (user_id, company_id, role)
VALUES (
  '2bf0401f-7c8a-4017-b3bd-033935e34860',
  'b653f344-b07a-44a2-ae2c-cf06bfb0645a',
  'company_owner'
)
ON CONFLICT (user_id, company_id) DO UPDATE
  SET role = EXCLUDED.role;
