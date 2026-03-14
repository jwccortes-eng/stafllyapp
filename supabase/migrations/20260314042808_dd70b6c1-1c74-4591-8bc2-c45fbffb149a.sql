
-- Add supervisor to app_role enum (standalone, no other operations)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
