
-- Enums
CREATE TYPE public.review_status AS ENUM ('generated', 'pending', 'submitted', 'expired', 'dismissed', 'flagged');
CREATE TYPE public.review_product AS ENUM ('stafly', 'parceros');
CREATE TYPE public.review_entity_type AS ENUM ('employee', 'captain', 'supervisor', 'shift', 'client', 'worker', 'location');
CREATE TYPE public.review_form_type AS ENUM ('captain_to_employee', 'employee_to_captain', 'employee_to_shift', 'captain_to_shift', 'admin_to_employee', 'client_to_worker', 'worker_to_client', 'service_experience');
CREATE TYPE public.review_flag_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- 1. review_sampling_config
CREATE TABLE public.review_sampling_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_product review_product NOT NULL DEFAULT 'stafly',
  base_sample_rate NUMERIC NOT NULL DEFAULT 0.3,
  new_entity_boost NUMERIC NOT NULL DEFAULT 0.5,
  incident_boost NUMERIC NOT NULL DEFAULT 0.7,
  low_score_boost NUMERIC NOT NULL DEFAULT 0.6,
  min_interval_days INTEGER NOT NULL DEFAULT 3,
  review_window_hours INTEGER NOT NULL DEFAULT 72,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, source_product)
);
ALTER TABLE public.review_sampling_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sampling_config_select" ON public.review_sampling_config FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_sampling_config.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner')));
CREATE POLICY "sampling_config_insert" ON public.review_sampling_config FOR INSERT TO authenticated
  WITH CHECK (public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_sampling_config.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner')));
CREATE POLICY "sampling_config_update" ON public.review_sampling_config FOR UPDATE TO authenticated
  USING (public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_sampling_config.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner')));

-- 2. review_requests
CREATE TABLE public.review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_product review_product NOT NULL DEFAULT 'stafly',
  source_event_type TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  evaluator_user_id UUID,
  evaluator_employee_id UUID REFERENCES public.employees(id),
  evaluated_entity_type review_entity_type NOT NULL,
  evaluated_entity_id UUID NOT NULL,
  evaluated_role TEXT,
  review_form_type review_form_type NOT NULL,
  status review_status NOT NULL DEFAULT 'pending',
  priority NUMERIC NOT NULL DEFAULT 0.5,
  sampling_reason TEXT,
  deadline_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rr_company ON public.review_requests(company_id);
CREATE INDEX idx_rr_evaluator ON public.review_requests(evaluator_user_id, status);
CREATE INDEX idx_rr_status ON public.review_requests(status, deadline_at);
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr_select" ON public.review_requests FOR SELECT TO authenticated
  USING (evaluator_user_id = auth.uid() OR public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_requests.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner', 'manager')));
CREATE POLICY "rr_insert" ON public.review_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rr_update" ON public.review_requests FOR UPDATE TO authenticated
  USING (evaluator_user_id = auth.uid() OR public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_requests.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner')));

-- 3. review_submissions
CREATE TABLE public.review_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id UUID REFERENCES public.review_requests(id),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_product review_product NOT NULL DEFAULT 'stafly',
  evaluator_user_id UUID NOT NULL,
  evaluator_employee_id UUID REFERENCES public.employees(id),
  evaluated_entity_type review_entity_type NOT NULL,
  evaluated_entity_id UUID NOT NULL,
  evaluated_role TEXT,
  review_form_type review_form_type NOT NULL,
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  comment TEXT,
  low_rating_reason TEXT,
  low_rating_reasons TEXT[],
  source_event_type TEXT,
  source_event_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_review_per_request UNIQUE(review_request_id)
);
CREATE INDEX idx_rs_company ON public.review_submissions(company_id);
CREATE INDEX idx_rs_evaluated ON public.review_submissions(evaluated_entity_id, evaluated_entity_type);
CREATE INDEX idx_rs_rating ON public.review_submissions(overall_rating);
ALTER TABLE public.review_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rs_select" ON public.review_submissions FOR SELECT TO authenticated
  USING (evaluator_user_id = auth.uid() OR public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_submissions.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner', 'manager')));
CREATE POLICY "rs_insert" ON public.review_submissions FOR INSERT TO authenticated WITH CHECK (evaluator_user_id = auth.uid());

-- 4. review_dimension_scores
CREATE TABLE public.review_dimension_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.review_submissions(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, category_key)
);
ALTER TABLE public.review_dimension_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_select" ON public.review_dimension_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.review_submissions rs WHERE rs.id = review_dimension_scores.submission_id AND (rs.evaluator_user_id = auth.uid() OR public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = rs.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner', 'manager')))));
CREATE POLICY "rds_insert" ON public.review_dimension_scores FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.review_submissions rs WHERE rs.id = review_dimension_scores.submission_id AND rs.evaluator_user_id = auth.uid()));

-- 5. review_flags
CREATE TABLE public.review_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.review_submissions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  severity review_flag_severity NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by UUID, resolved_at TIMESTAMPTZ, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rf_company ON public.review_flags(company_id, status);
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rf_select" ON public.review_flags FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_flags.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner', 'manager')));
CREATE POLICY "rf_insert" ON public.review_flags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rf_update" ON public.review_flags FOR UPDATE TO authenticated
  USING (public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_flags.company_id AND cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner', 'manager')));

-- 6. review_scores
CREATE TABLE public.review_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type review_entity_type NOT NULL,
  entity_id UUID NOT NULL,
  score_type TEXT NOT NULL DEFAULT 'overall',
  score_value NUMERIC NOT NULL DEFAULT 50,
  score_count INTEGER NOT NULL DEFAULT 0,
  weighted_score NUMERIC,
  trend TEXT DEFAULT 'stable',
  last_review_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, entity_type, entity_id, score_type)
);
CREATE INDEX idx_rsc_entity ON public.review_scores(entity_id, entity_type);
ALTER TABLE public.review_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rsc_select" ON public.review_scores FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = review_scores.company_id AND cu.user_id = auth.uid()));
CREATE POLICY "rsc_insert" ON public.review_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rsc_update" ON public.review_scores FOR UPDATE TO authenticated USING (true);

-- 7. review_form_dimensions
CREATE TABLE public.review_form_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type review_form_type NOT NULL,
  category_key TEXT NOT NULL,
  label_es TEXT NOT NULL,
  label_en TEXT NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(form_type, category_key)
);
ALTER TABLE public.review_form_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rfd_select" ON public.review_form_dimensions FOR SELECT TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_requests;
