
-- Implementation tracking board for super admin
CREATE TABLE public.implementation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'blocked')),
  category text DEFAULT 'feature',
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text DEFAULT '',
  prompt_ref text DEFAULT ''
);

ALTER TABLE public.implementation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only owners can manage implementation_log"
  ON public.implementation_log FOR ALL
  USING (is_global_owner(auth.uid()));

CREATE TRIGGER update_implementation_log_updated_at
  BEFORE UPDATE ON public.implementation_log
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
