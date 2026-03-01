
-- Table: shift_rides — tracks ride assignments per shift
CREATE TABLE public.shift_rides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.employees(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  ride_type text NOT NULL DEFAULT 'regular' CHECK (ride_type IN ('regular', 'special')),
  passenger_count integer NOT NULL DEFAULT 0,
  movement_id uuid REFERENCES public.movements(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_shift_rides_shift ON public.shift_rides(shift_id);
CREATE INDEX idx_shift_rides_driver ON public.shift_rides(driver_id);
CREATE INDEX idx_shift_rides_company ON public.shift_rides(company_id);

-- Auto-update timestamp
CREATE TRIGGER update_shift_rides_updated_at
  BEFORE UPDATE ON public.shift_rides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.shift_rides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company shift_rides"
  ON public.shift_rides FOR ALL
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers with shifts edit can manage rides"
  ON public.shift_rides FOR ALL
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'shifts', 'edit')
  );

CREATE POLICY "Owners can manage all shift_rides"
  ON public.shift_rides FOR ALL
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Employees can view own rides"
  ON public.shift_rides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = shift_rides.driver_id AND e.user_id = auth.uid()
    )
  );
