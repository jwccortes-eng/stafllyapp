
-- Create audit log table for sensitive data access tracking
CREATE TABLE public.sensitive_data_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'select',
  table_name text NOT NULL,
  record_id uuid,
  fields_accessed text[] NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sensitive_data_audit_log ENABLE ROW LEVEL SECURITY;

-- Only owners can view audit logs
CREATE POLICY "Owners can view audit logs" ON public.sensitive_data_audit_log
  FOR SELECT TO authenticated
  USING (is_global_owner(auth.uid()));

-- System can insert audit logs (via trigger)
CREATE POLICY "System can insert audit logs" ON public.sensitive_data_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create a function that logs access to sensitive employee fields
-- This is called from the frontend when viewing SSN/EIN data
CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  _table_name text,
  _record_id uuid,
  _fields text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO sensitive_data_audit_log (user_id, table_name, record_id, fields_accessed)
  VALUES (auth.uid(), _table_name, _record_id, _fields);
END;
$$;
