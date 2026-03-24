
-- 1. Add calculation_mode to pay_periods
ALTER TABLE public.pay_periods 
ADD COLUMN IF NOT EXISTS calculation_mode text NOT NULL DEFAULT 'historical_import'
CHECK (calculation_mode IN ('historical_import', 'native_stafly', 'hybrid'));

-- 2. Add calculation_mode_changed_by and calculation_mode_changed_at for audit
ALTER TABLE public.pay_periods 
ADD COLUMN IF NOT EXISTS calculation_mode_changed_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS calculation_mode_changed_at timestamptz;

-- 3. Create company_cutover_dates table
CREATE TABLE IF NOT EXISTS public.company_cutover_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cutover_date date NOT NULL,
  set_by uuid REFERENCES auth.users(id),
  set_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE(company_id)
);

ALTER TABLE public.company_cutover_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view cutover dates"
  ON public.company_cutover_dates FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Owners can manage cutover dates"
  ON public.company_cutover_dates FOR ALL TO authenticated
  USING (public.is_company_owner(auth.uid(), company_id))
  WITH CHECK (public.is_company_owner(auth.uid(), company_id));

-- 4. Also mirror calculation_mode on reconciliation_period_status for convenience
ALTER TABLE public.reconciliation_period_status 
ADD COLUMN IF NOT EXISTS calculation_mode text DEFAULT 'historical_import'
CHECK (calculation_mode IN ('historical_import', 'native_stafly', 'hybrid'));
