
-- 1) Add meeting_point and special_instructions to scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS meeting_point text,
  ADD COLUMN IF NOT EXISTS special_instructions text;

-- 2) Notification templates per transaction type
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  transaction_type text NOT NULL, -- 'shift_assigned', 'shift_approved', 'shift_rejected', 'shift_reminder', 'shift_updated', 'general'
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company templates"
  ON public.notification_templates FOR ALL
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can manage all templates"
  ON public.notification_templates FOR ALL
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Managers can view templates"
  ON public.notification_templates FOR SELECT
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'view'));

CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Shift comments with attachment support
CREATE TABLE public.shift_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id),
  author_id uuid NOT NULL, -- user_id of admin/manager or employee user_id
  author_type text NOT NULL DEFAULT 'user', -- 'user' or 'employee'
  content text NOT NULL DEFAULT '',
  attachments jsonb DEFAULT '[]'::jsonb, -- [{url, filename, type}]
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company shift_comments"
  ON public.shift_comments FOR ALL
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can manage all shift_comments"
  ON public.shift_comments FOR ALL
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Managers with shifts access can view comments"
  ON public.shift_comments FOR SELECT
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'view'));

CREATE POLICY "Managers with shifts edit can insert comments"
  ON public.shift_comments FOR INSERT
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'edit'));

CREATE POLICY "Employees can view comments on their shifts"
  ON public.shift_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shift_assignments sa
    JOIN employees e ON e.id = sa.employee_id
    WHERE sa.shift_id = shift_comments.shift_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Employees can insert comments on their shifts"
  ON public.shift_comments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shift_assignments sa
    JOIN employees e ON e.id = sa.employee_id
    WHERE sa.shift_id = shift_comments.shift_id AND e.user_id = auth.uid()
  ));

CREATE TRIGGER update_shift_comments_updated_at
  BEFORE UPDATE ON public.shift_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Storage bucket for shift attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('shift-attachments', 'shift-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for shift attachments
CREATE POLICY "Authenticated users can upload shift attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'shift-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view shift attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'shift-attachments');

CREATE POLICY "Admins can delete shift attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'shift-attachments' AND (
    is_global_owner(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
  ));
