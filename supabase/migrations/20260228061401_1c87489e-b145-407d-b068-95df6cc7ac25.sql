-- Add unique constraint on company_users for upsert support
ALTER TABLE public.company_users 
ADD CONSTRAINT company_users_user_company_unique UNIQUE (user_id, company_id);
