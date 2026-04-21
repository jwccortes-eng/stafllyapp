-- ─────────────────────────────────────────────────────────────────────────
-- Smart Dispatch — learning loop persistence
-- Stores every suggestion the auto-dispatch engine generates and the
-- admin's response (executed / dismissed / ignored). Pure logging — does
-- not touch payroll, attendance, or shift_assignments directly.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dispatch_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- What the engine proposed
  action_type TEXT NOT NULL,                -- 'REPLACE_WORKERS' | 'BROADCAST' | 'REASSIGN' | ...
  shift_id UUID NULL REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  zone TEXT NULL,                            -- location / client name for grouped suggestions
  candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ranked candidate snapshot
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NULL,

  -- Admin response
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'executed', 'partially_executed', 'dismissed', 'expired')),
  decided_at TIMESTAMPTZ NULL,
  decided_by UUID NULL,                      -- admin user
  executed_assignments JSONB NULL,           -- which employees ended up assigned
  outcome TEXT NULL,                         -- free-form note for postmortem

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_logs_company_status
  ON public.dispatch_logs (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_logs_shift
  ON public.dispatch_logs (shift_id) WHERE shift_id IS NOT NULL;

-- Auto-touch updated_at
CREATE TRIGGER trg_dispatch_logs_touch
BEFORE UPDATE ON public.dispatch_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — same access pattern as other ops tables: company admins / owner / developer
ALTER TABLE public.dispatch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view dispatch logs"
ON public.dispatch_logs
FOR SELECT TO authenticated
USING (
  public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Company admins can insert dispatch logs"
ON public.dispatch_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Company admins can update dispatch logs"
ON public.dispatch_logs
FOR UPDATE TO authenticated
USING (
  public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
