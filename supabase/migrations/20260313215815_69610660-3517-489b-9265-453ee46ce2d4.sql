
-- Employee badges table
CREATE TABLE public.employee_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  badge_label text NOT NULL,
  badge_emoji text NOT NULL DEFAULT '🏆',
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, badge_key)
);

CREATE INDEX idx_employee_badges_employee ON public.employee_badges(employee_id);

ALTER TABLE public.employee_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can read badges"
  ON public.employee_badges FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company users can manage badges"
  ON public.employee_badges FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Anon can read badges"
  ON public.employee_badges FOR SELECT
  TO anon
  USING (true);
