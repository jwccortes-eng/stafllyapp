
-- Add before/after columns to activity_log for detailed audit trail
ALTER TABLE public.activity_log 
  ADD COLUMN IF NOT EXISTS old_data jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS new_data jsonb DEFAULT NULL;

-- Create enhanced audit logging function with before/after
CREATE OR REPLACE FUNCTION public.log_activity_detailed(
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _company_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb,
  _old_data jsonb DEFAULT NULL,
  _new_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO activity_log (user_id, company_id, action, entity_type, entity_id, details, old_data, new_data)
  VALUES (auth.uid(), _company_id, _action, _entity_type, _entity_id, _details, _old_data, _new_data);
END;
$$;
