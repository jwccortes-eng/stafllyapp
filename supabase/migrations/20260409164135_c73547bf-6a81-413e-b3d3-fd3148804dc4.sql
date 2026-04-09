-- Add unique constraint for phone per company to enforce server-side duplicate detection
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_applications_company_phone 
ON public.job_applications (company_id, phone) 
WHERE status NOT IN ('rejected', 'withdrawn');