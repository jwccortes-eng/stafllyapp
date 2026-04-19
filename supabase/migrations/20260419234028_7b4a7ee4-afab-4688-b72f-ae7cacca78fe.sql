-- 1) Garantizar 1 hilo por turno
DELETE FROM public.shift_chat_config a
USING public.shift_chat_config b
WHERE a.ctid < b.ctid AND a.shift_id = b.shift_id;

ALTER TABLE public.shift_chat_config
  DROP CONSTRAINT IF EXISTS shift_chat_config_shift_id_key;
ALTER TABLE public.shift_chat_config
  ADD CONSTRAINT shift_chat_config_shift_id_key UNIQUE (shift_id);

-- 2) Helper: ¿el usuario está asignado activo a este turno?
CREATE OR REPLACE FUNCTION public.user_is_assigned_to_shift(_user_id uuid, _shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    JOIN public.employees e ON e.id = sa.employee_id
    WHERE sa.shift_id = _shift_id
      AND e.user_id = _user_id
      AND sa.status NOT IN ('rejected','removed')
  )
$$;

-- 3) Helper: ¿es admin/owner de la empresa?
CREATE OR REPLACE FUNCTION public.user_is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.is_company_owner(_user_id, _company_id)
    OR public.has_company_role(_user_id, _company_id, 'admin')
$$;

-- 4) RLS shift_chat_config: SELECT para asignados o admins; INSERT/UPDATE para admins o asignados (autocreate)
DROP POLICY IF EXISTS "Users can read shift chat config for their company" ON public.shift_chat_config;
DROP POLICY IF EXISTS "Admins can insert shift chat config" ON public.shift_chat_config;
DROP POLICY IF EXISTS "Admins can update shift chat config" ON public.shift_chat_config;
DROP POLICY IF EXISTS "scc_select" ON public.shift_chat_config;
DROP POLICY IF EXISTS "scc_insert" ON public.shift_chat_config;
DROP POLICY IF EXISTS "scc_update" ON public.shift_chat_config;

CREATE POLICY "scc_select"
ON public.shift_chat_config FOR SELECT
USING (
  public.user_is_company_admin(auth.uid(), company_id)
  OR public.user_is_assigned_to_shift(auth.uid(), shift_id)
);

CREATE POLICY "scc_insert"
ON public.shift_chat_config FOR INSERT
WITH CHECK (
  public.user_is_company_admin(auth.uid(), company_id)
  OR public.user_is_assigned_to_shift(auth.uid(), shift_id)
);

CREATE POLICY "scc_update"
ON public.shift_chat_config FOR UPDATE
USING (public.user_is_company_admin(auth.uid(), company_id))
WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

-- 5) RLS shift_chat_messages: SELECT solo asignados o admin; INSERT estricto por rol
DROP POLICY IF EXISTS "Users can read shift chat messages for their company" ON public.shift_chat_messages;
DROP POLICY IF EXISTS "Admins can send shift chat messages" ON public.shift_chat_messages;
DROP POLICY IF EXISTS "Employees can send shift chat messages if assigned" ON public.shift_chat_messages;
DROP POLICY IF EXISTS "scm_select" ON public.shift_chat_messages;
DROP POLICY IF EXISTS "scm_insert_admin" ON public.shift_chat_messages;
DROP POLICY IF EXISTS "scm_insert_employee" ON public.shift_chat_messages;

CREATE POLICY "scm_select"
ON public.shift_chat_messages FOR SELECT
USING (
  public.user_is_company_admin(auth.uid(), company_id)
  OR public.user_is_assigned_to_shift(auth.uid(), shift_id)
);

CREATE POLICY "scm_insert_admin"
ON public.shift_chat_messages FOR INSERT
WITH CHECK (
  sender_type = 'admin'
  AND sender_user_id = auth.uid()
  AND public.user_is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "scm_insert_employee"
ON public.shift_chat_messages FOR INSERT
WITH CHECK (
  sender_type = 'employee'
  AND sender_employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND public.user_is_assigned_to_shift(auth.uid(), shift_id)
);