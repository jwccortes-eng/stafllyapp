-- Remove unused ip_address column from activity_log to prevent privacy risks
ALTER TABLE public.activity_log DROP COLUMN IF EXISTS ip_address;

-- Also remove from sensitive_data_audit_log
ALTER TABLE public.sensitive_data_audit_log DROP COLUMN IF EXISTS ip_address;