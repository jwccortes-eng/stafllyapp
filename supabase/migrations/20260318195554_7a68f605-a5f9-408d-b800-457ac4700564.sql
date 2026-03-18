
-- First check if tin_encrypted has any data, then drop it
-- Drop the residual tin_encrypted column from contractor_w9
ALTER TABLE public.contractor_w9 DROP COLUMN IF EXISTS tin_encrypted;
