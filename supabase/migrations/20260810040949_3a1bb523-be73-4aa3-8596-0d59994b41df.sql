CREATE TABLE public.employee_identity_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  employee_ids UUID[] NOT NULL DEFAULT '{}',
  decision TEXT NOT NULL CHECK (decision IN ('not_duplicate','consolidation_prepared','assignment_reviewed','deferred')),
  recommended_primary_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  confirmed_primary_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  verdict_at_review TEXT,
  signals_at_review JSONB NOT NULL DEFAULT '[]'::jsonb,
  merge_plan JSONB,
  notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX employee_identity_reviews_company_group_uidx
  ON public.employee_identity_reviews (company_id, group_key);

CREATE INDEX employee_identity_reviews_company_idx
  ON public.employee_identity_reviews (company_id, decision);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_identity_reviews TO authenticated;
GRANT ALL ON public.employee_identity_reviews TO service_role;

ALTER TABLE public.employee_identity_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view identity reviews"
ON public.employee_identity_reviews
FOR SELECT
TO authenticated
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company managers can record identity reviews"
ON public.employee_identity_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_permission(auth.uid(), 'employees'::text, 'edit'::text)
  )
);

CREATE POLICY "Company managers can update identity reviews"
ON public.employee_identity_reviews
FOR UPDATE
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_permission(auth.uid(), 'employees'::text, 'edit'::text)
  )
)
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_permission(auth.uid(), 'employees'::text, 'edit'::text)
  )
);

CREATE POLICY "Owners can manage identity reviews"
ON public.employee_identity_reviews
FOR ALL
TO authenticated
USING (public.is_global_owner(auth.uid()))
WITH CHECK (public.is_global_owner(auth.uid()));

CREATE TRIGGER update_employee_identity_reviews_updated_at
BEFORE UPDATE ON public.employee_identity_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER employee_identity_reviews_bump_version
BEFORE UPDATE ON public.employee_identity_reviews
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();