
-- Fix: Remove direct INSERT policy on audit log to prevent manipulation
-- All inserts should go through the log_sensitive_access() SECURITY DEFINER function
DROP POLICY IF EXISTS "System can insert audit logs" ON public.sensitive_data_audit_log;
