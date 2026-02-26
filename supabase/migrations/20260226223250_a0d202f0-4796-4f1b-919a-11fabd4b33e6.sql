
-- Table for demo request leads from landing page (public, no auth required)
CREATE TABLE public.demo_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  employee_count TEXT,
  source TEXT DEFAULT 'landing',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public form)
CREATE POLICY "Anyone can submit demo request"
  ON public.demo_requests
  FOR INSERT
  WITH CHECK (true);

-- Only admins/owners can view requests
CREATE POLICY "Owners can view demo requests"
  ON public.demo_requests
  FOR SELECT
  USING (public.is_global_owner(auth.uid()));

-- Prevent public reads
CREATE POLICY "No public reads"
  ON public.demo_requests
  FOR SELECT
  USING (false);
