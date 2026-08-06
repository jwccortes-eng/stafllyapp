-- ============================================================
-- FASE 1 — COMPANY APPROVAL AND ACCESS STATE
-- Separa Approval / Access / Commercial. Sin Stripe, sin cobros,
-- sin cambiar el acceso efectivo de ninguna empresa real.
-- ============================================================

-- 1. ESTADOS ------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS approval_state   text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by      uuid,
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS submitted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS access_state     text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS access_state_reason text,
  ADD COLUMN IF NOT EXISTS access_state_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commercial_state text NOT NULL DEFAULT 'manual';

-- Backfill: las empresas existentes ya fueron admitidas manualmente.
UPDATE public.companies
   SET approval_state = 'approved',
       approved_at    = COALESCE(approved_at, created_at)
 WHERE approval_state = 'draft';

-- Backfill de acceso a partir del estado real vigente (sin cambiarlo).
UPDATE public.companies
   SET access_state = CASE
         WHEN status = 'suspended' THEN 'suspended'
         WHEN is_active = false    THEN 'restricted'
         ELSE 'active'
       END,
       access_state_changed_at = COALESCE(access_state_changed_at, updated_at)
 WHERE access_state = 'active'
   AND (status = 'suspended' OR is_active = false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_approval_state_check') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_approval_state_check
      CHECK (approval_state IN ('draft','needs_review','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_access_state_check') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_access_state_check
      CHECK (access_state IN ('active','grace','restricted','suspended','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_commercial_state_check') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_commercial_state_check
      CHECK (commercial_state IN ('manual','trial','active','past_due','agreement','cancelled'));
  END IF;
END $$;

-- 2. AUDITORÍA ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transition text NOT NULL,
  from_approval_state text,
  to_approval_state text,
  from_access_state text,
  to_access_state text,
  from_commercial_state text,
  to_commercial_state text,
  actor_id uuid,
  reason text,
  idempotency_key text,
  company_version_before integer,
  company_version_after integer,
  next_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_lifecycle_events_idem_uk
  ON public.company_lifecycle_events (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT ON public.company_lifecycle_events TO authenticated;
GRANT ALL ON public.company_lifecycle_events TO service_role;
ALTER TABLE public.company_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global owners read company lifecycle events" ON public.company_lifecycle_events;
CREATE POLICY "Global owners read company lifecycle events"
  ON public.company_lifecycle_events FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()));

DROP POLICY IF EXISTS "Company admins read own lifecycle events" ON public.company_lifecycle_events;
CREATE POLICY "Company admins read own lifecycle events"
  ON public.company_lifecycle_events FOR SELECT TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

-- 3. BLOQUEO DE ESCRITURA DIRECTA ---------------------------
-- Approval / Access / Commercial sólo cambian por transición canónica.
CREATE OR REPLACE FUNCTION public.guard_company_lifecycle_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('stafly.company_lifecycle_tx', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_state IS DISTINCT FROM OLD.approval_state
     OR NEW.access_state IS DISTINCT FROM OLD.access_state
     OR NEW.commercial_state IS DISTINCT FROM OLD.commercial_state THEN
    RAISE EXCEPTION 'Los estados de ciclo de vida sólo cambian por transición canónica (approve_company, set_company_access_state, ...)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_company_lifecycle_states ON public.companies;
CREATE TRIGGER guard_company_lifecycle_states
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_lifecycle_states();

-- 4. TRANSICIONES CANÓNICAS ---------------------------------
CREATE OR REPLACE FUNCTION public.company_lifecycle_transition(
  p_company_id uuid,
  p_transition text,
  p_expected_approval_state text DEFAULT NULL,
  p_expected_access_state text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_target_access_state text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.companies%ROWTYPE;
  v_prev public.company_lifecycle_events%ROWTYPE;
  v_new_approval text;
  v_new_access text;
  v_next_action text;
  v_is_owner boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','denied','message','Sesión requerida');
  END IF;

  -- Idempotencia: un reintento no produce una segunda transición.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.company_lifecycle_events
     WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key
     LIMIT 1;
    IF FOUND THEN
      SELECT * INTO v_row FROM public.companies WHERE id = p_company_id;
      RETURN jsonb_build_object(
        'status','noop','replayed',true,
        'approval_state', v_row.approval_state,
        'access_state', v_row.access_state,
        'commercial_state', v_row.commercial_state,
        'version', v_row.version,
        'next_action', v_prev.next_action
      );
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','error','reason','not_found','message','Empresa no encontrada');
  END IF;

  v_is_owner := public.is_global_owner(v_actor);

  -- Fail-closed: sólo owner global decide; admin de la empresa sólo puede enviar a revisión.
  IF p_transition = 'submit_for_review' THEN
    IF NOT (v_is_owner OR public.has_company_role(v_actor, p_company_id, 'admin')) THEN
      RETURN jsonb_build_object('status','error','reason','denied','message','Sin permiso para enviar a revisión');
    END IF;
  ELSIF NOT v_is_owner THEN
    RETURN jsonb_build_object('status','error','reason','denied','message','Sólo un propietario global puede ejecutar esta transición');
  END IF;

  -- VWC: estado y versión esperados.
  IF p_expected_version IS NOT NULL AND p_expected_version IS DISTINCT FROM v_row.version THEN
    RETURN jsonb_build_object('status','conflict','expected_version',p_expected_version,
      'actual_version',v_row.version,'approval_state',v_row.approval_state,'access_state',v_row.access_state);
  END IF;
  IF p_expected_approval_state IS NOT NULL AND p_expected_approval_state IS DISTINCT FROM v_row.approval_state THEN
    RETURN jsonb_build_object('status','conflict','expected_approval_state',p_expected_approval_state,
      'actual_approval_state',v_row.approval_state,'actual_version',v_row.version);
  END IF;
  IF p_expected_access_state IS NOT NULL AND p_expected_access_state IS DISTINCT FROM v_row.access_state THEN
    RETURN jsonb_build_object('status','conflict','expected_access_state',p_expected_access_state,
      'actual_access_state',v_row.access_state,'actual_version',v_row.version);
  END IF;

  v_new_approval := v_row.approval_state;
  v_new_access := v_row.access_state;

  IF p_transition = 'submit_for_review' THEN
    IF v_row.approval_state NOT IN ('draft','rejected','needs_review') THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','La empresa ya fue aprobada');
    END IF;
    v_new_approval := 'needs_review';
    v_new_access := 'restricted';
    v_next_action := 'Revisión humana pendiente';

  ELSIF p_transition = 'approve' THEN
    IF v_row.approval_state = 'approved' THEN
      RETURN jsonb_build_object('status','noop','approval_state','approved','access_state',v_row.access_state,'version',v_row.version);
    END IF;
    v_new_approval := 'approved';
    v_new_access := 'active';
    v_next_action := 'Configurar plan y módulos';

  ELSIF p_transition = 'reject' THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','El rechazo exige motivo');
    END IF;
    v_new_approval := 'rejected';
    v_new_access := 'restricted';
    v_next_action := 'Notificar al solicitante';

  ELSIF p_transition = 'set_access_state' THEN
    IF p_target_access_state IS NULL
       OR p_target_access_state NOT IN ('active','grace','restricted','suspended','cancelled') THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Estado de acceso inválido');
    END IF;
    IF p_target_access_state = 'active' AND v_row.approval_state <> 'approved' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Sólo una empresa aprobada puede quedar activa');
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Cambiar el acceso exige motivo');
    END IF;
    IF p_target_access_state = v_row.access_state THEN
      RETURN jsonb_build_object('status','noop','approval_state',v_row.approval_state,'access_state',v_row.access_state,'version',v_row.version);
    END IF;
    v_new_access := p_target_access_state;
    v_next_action := 'Comunicar el cambio de acceso a la empresa';

  ELSIF p_transition = 'reactivate' THEN
    IF v_row.approval_state <> 'approved' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Sólo una empresa aprobada puede reactivarse');
    END IF;
    IF v_row.access_state = 'active' THEN
      RETURN jsonb_build_object('status','noop','approval_state',v_row.approval_state,'access_state','active','version',v_row.version);
    END IF;
    v_new_access := 'active';
    v_next_action := 'Verificar módulos y límites del plan';

  ELSE
    RETURN jsonb_build_object('status','error','reason','invalid','message','Transición desconocida');
  END IF;

  PERFORM set_config('stafly.company_lifecycle_tx','1',true);

  UPDATE public.companies
     SET approval_state = v_new_approval,
         access_state   = v_new_access,
         access_state_reason = COALESCE(p_reason, access_state_reason),
         access_state_changed_at = CASE WHEN v_new_access IS DISTINCT FROM v_row.access_state THEN now() ELSE access_state_changed_at END,
         approved_by = CASE WHEN v_new_approval = 'approved' THEN v_actor ELSE approved_by END,
         approved_at = CASE WHEN v_new_approval = 'approved' THEN now() ELSE approved_at END,
         submitted_at = CASE WHEN v_new_approval = 'needs_review' THEN now() ELSE submitted_at END,
         rejection_reason = CASE WHEN v_new_approval = 'rejected' THEN p_reason
                                 WHEN v_new_approval = 'approved' THEN NULL
                                 ELSE rejection_reason END,
         -- is_active deja de ser el estado operativo: sólo refleja "tenant vivo".
         is_active = (v_new_access <> 'cancelled'),
         updated_at = now()
   WHERE id = p_company_id
  RETURNING * INTO v_row;

  PERFORM set_config('stafly.company_lifecycle_tx','0',true);

  INSERT INTO public.company_lifecycle_events (
    company_id, transition,
    from_approval_state, to_approval_state,
    from_access_state, to_access_state,
    from_commercial_state, to_commercial_state,
    actor_id, reason, idempotency_key,
    company_version_before, company_version_after, next_action
  ) VALUES (
    p_company_id, p_transition,
    p_expected_approval_state, v_row.approval_state,
    p_expected_access_state, v_row.access_state,
    v_row.commercial_state, v_row.commercial_state,
    v_actor, p_reason, p_idempotency_key,
    p_expected_version, v_row.version, v_next_action
  );

  RETURN jsonb_build_object(
    'status','applied',
    'approval_state', v_row.approval_state,
    'access_state', v_row.access_state,
    'commercial_state', v_row.commercial_state,
    'is_active', v_row.is_active,
    'version', v_row.version,
    'next_action', v_next_action
  );
END;
$$;

REVOKE ALL ON FUNCTION public.company_lifecycle_transition(uuid,text,text,text,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_lifecycle_transition(uuid,text,text,text,integer,text,text,text) TO authenticated;