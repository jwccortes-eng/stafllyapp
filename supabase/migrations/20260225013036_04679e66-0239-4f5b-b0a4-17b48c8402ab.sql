
-- Create saved_reports table
CREATE TABLE public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  report_type text NOT NULL DEFAULT 'summary',
  filters jsonb DEFAULT '{}',
  report_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

-- Owners/admins full access
CREATE POLICY "Admins can manage all reports"
ON public.saved_reports FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Managers with 'reports' permission can CRUD their own
CREATE POLICY "Managers can view own reports"
ON public.saved_reports FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.has_module_permission(auth.uid(), 'reports', 'view'));

CREATE POLICY "Managers can insert own reports"
ON public.saved_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.has_module_permission(auth.uid(), 'reports', 'edit'));

CREATE POLICY "Managers can update own reports"
ON public.saved_reports FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND public.has_module_permission(auth.uid(), 'reports', 'edit'));

CREATE POLICY "Managers can delete own reports"
ON public.saved_reports FOR DELETE TO authenticated
USING (auth.uid() = user_id AND public.has_module_permission(auth.uid(), 'reports', 'delete'));

-- Trigger for updated_at
CREATE TRIGGER update_saved_reports_updated_at
BEFORE UPDATE ON public.saved_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
